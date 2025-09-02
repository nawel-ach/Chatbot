import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from datetime import datetime
import json

from db_manager import DatabaseManager
from deepseek_service import DeepSeekService
from conversation_manager import ConversationManager, ConversationState

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "../frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, template_folder=FRONTEND_DIR)
CORS(app)

# Initialize services
db = DatabaseManager()
deepseek = DeepSeekService()
conv_manager = ConversationManager()



@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(FRONTEND_DIR, path)



@app.route('/api/chat', methods=['GET', 'POST'])
def chat():
    """Main chat endpoint"""
    try:
        data = request.json
        message = data.get('message', '').strip()
        session_id = data.get('sessionId', 'default_session')
        
        if not message:
            return jsonify({
                'type': 'text',
                'reply': 'Please provide a message.'
            }), 400
        
        # Get user info for logging
        user_ip = request.remote_addr
        user_agent = request.headers.get('User-Agent', '')
        
        # Save session if new
        db.save_chat_session(session_id, user_ip, user_agent)
        
        # Save user message
        db.save_message(session_id, 'user', message)
        
        # Get or create session context
        session = conv_manager.get_or_create_session(session_id)
        
        # Process message based on current state
        response = process_message(message, session)
        
        # Save assistant response
        db.save_message(session_id, 'assistant', response.get('reply', ''), 
                       metadata={'state': session.state.value})
        
        return jsonify(response)
        
    except Exception as e:
        print(f"Chat endpoint error: {e}")
        return jsonify({
            'type': 'text',
            'reply': 'Sorry, I encountered an error. Please try again.'
        }), 500


def process_message(message: str, session):
    """Process message based on conversation state"""
    
    # First message - show welcome
    if session.state == ConversationState.WELCOME:
        session.state = ConversationState.SEARCH_METHOD_SELECTION
        return {
            'type': 'text',
            'reply': "Welcome to IMOBOT! 🚗\n\nI can help you find spare parts. How would you like to search?\n\n1️⃣ By serial/part number\n2️⃣ By vehicle and part name",
            'suggestions': ['Search by serial number', 'Search by vehicle']
        }
    
    # Get AI analysis
    ai_response = deepseek.analyze_intent(message, session)
    
    # Handle search method selection
    if session.state == ConversationState.SEARCH_METHOD_SELECTION:
        if 'serial' in message.lower() or 'number' in message.lower() or '1' in message:
            session.search_method = 'serial'
            session.state = ConversationState.COLLECT_SERIAL
            return {
                'type': 'text',
                'reply': '🔍 Great! Please enter the serial number or part reference.',
                'suggestions': []
            }
        else:
            session.search_method = 'part'
            session.state = ConversationState.COLLECT_VEHICLE_INFO
            return {
                'type': 'text',
                'reply': '🚗 Perfect! Please tell me your vehicle details:\n- Brand (Toyota, Peugeot, etc.)\n- Model\n- Year',
                'suggestions': ['Toyota Corolla 2020', 'Peugeot 308 2019', 'Renault Clio 2018']
            }
    
    # Handle vehicle information collection
    if session.state == ConversationState.COLLECT_VEHICLE_INFO:
        vehicle_info = conv_manager.extract_vehicle_info(message)
        
        # Also try to get from AI response
        if ai_response.get('vehicle_brand'):
            session.vehicle_brand = ai_response['vehicle_brand']
        elif vehicle_info.get('brand'):
            session.vehicle_brand = vehicle_info['brand']
            
        if ai_response.get('vehicle_model'):
            session.vehicle_model = ai_response['vehicle_model']
        elif vehicle_info.get('model'):
            session.vehicle_model = vehicle_info['model']
            
        if ai_response.get('vehicle_year'):
            session.vehicle_year = ai_response['vehicle_year']
        elif vehicle_info.get('year'):
            session.vehicle_year = vehicle_info['year']
        
        # Check if we have all info
        if session.vehicle_brand and session.vehicle_model and session.vehicle_year:
            session.state = ConversationState.CONFIRM_VEHICLE
            vehicle_str = f"{session.vehicle_brand} {session.vehicle_model} {session.vehicle_year}"
            return {
                'type': 'text',
                'reply': f"✅ Got it! Your vehicle is:\n\n🚗 {vehicle_str}\n\nIs this correct?",
                'suggestions': ['Yes, correct', 'No, let me re-enter']
            }
        else:
            # Ask for missing info
            missing = []
            if not session.vehicle_brand:
                missing.append('brand')
            if not session.vehicle_model:
                missing.append('model')
            if not session.vehicle_year:
                missing.append('year')
            
            return {
                'type': 'text',
                'reply': f"I still need the {', '.join(missing)} of your vehicle. Please provide these details.",
                'suggestions': []
            }
    
    # Handle vehicle confirmation
    if session.state == ConversationState.CONFIRM_VEHICLE:
        if any(word in message.lower() for word in ['yes', 'correct', 'right', 'oui', 'ok']):
            session.state = ConversationState.COLLECT_PART_NAME
            return {
                'type': 'text',
                'reply': '🔧 Excellent! What spare part are you looking for?',
                'suggestions': ['Brake pads', 'Oil filter', 'Air filter', 'Battery', 'Alternator']
            }
        else:
            # Reset vehicle info
            session.vehicle_brand = None
            session.vehicle_model = None
            session.vehicle_year = None
            session.state = ConversationState.COLLECT_VEHICLE_INFO
            return {
                'type': 'text',
                'reply': '↩️ No problem! Please provide your vehicle details again:\n- Brand\n- Model\n- Year',
                'suggestions': []
            }
    
    # Handle part name collection
    if session.state == ConversationState.COLLECT_PART_NAME:
        # Extract part name from message or AI response
        part_name = ai_response.get('part_name', message)
        session.part_name = part_name
        
        # Search for parts
        results = db.search_parts_for_vehicle(
            session.vehicle_brand,
            session.vehicle_model,
            session.vehicle_year,
            part_name
        )
        
        session.search_results = results
        session.state = ConversationState.SHOW_RESULTS
        
        if results:
            # Format results for display
            parts_data = []
            for part in results[:5]:
                parts_data.append({
                    'part_no': part.get('internal_reference', ''),
                    'description': part.get('product_name', ''),
                    'qty': part.get('quantity_on_hand', 0),
                    'unit_price': float(part.get('sales_price', 0))
                })
            
            reply = deepseek.generate_natural_response(results, session)
            
            return {
                'type': 'parts',
                'reply': reply,
                'data': parts_data,
                'suggestions': ['Order now', 'Search another part', 'Contact support']
            }
        else:
            session.awaiting_contact = True
            session.requested_part = part_name
            session.state = ConversationState.COLLECT_CONTACT
            return {
                'type': 'text',
                'reply': f"❌ Sorry, I couldn't find {part_name} for your {session.vehicle_brand} {session.vehicle_model}.\n\n📞 Would you like to leave your contact information? We'll notify you when it becomes available.",
                'suggestions': ['Yes, I want to be notified', 'Search another part']
            }
    
    # Handle serial number search
    if session.state == ConversationState.COLLECT_SERIAL:
        serial = message.strip()
        session.serial_number = serial
        
        # Search by serial
        result = db.search_by_serial(serial)
        
        if result:
            session.search_results = [result]
            session.state = ConversationState.SHOW_RESULTS
            
            qty = result.get('quantity_on_hand', 0)
            price = float(result.get('sales_price', 0))
            
            if qty > 0:
                reply = f"✅ Found part {serial}!\n\n📦 Product: {result['product_name']}\n💰 Price: {price:.2f} DZD\n📊 Stock: {qty} units\n\nWould you like to order this part?"
                suggestions = ['Order now', 'Search another part']
            else:
                reply = f"⚠️ Part {serial} found but OUT OF STOCK.\n\n📦 Product: {result['product_name']}\n\nWould you like us to notify you when it's available?"
                suggestions = ['Notify me when available', 'Search another part']
                session.awaiting_contact = True
                session.requested_part = result['product_name']
                session.state = ConversationState.COLLECT_CONTACT
            
            return {
                'type': 'parts',
                'reply': reply,
                'data': [{
                    'part_no': result.get('internal_reference', ''),
                    'description': result.get('product_name', ''),
                    'qty': qty,
                    'unit_price': price
                }],
                'suggestions': suggestions
            }
        else:
            session.awaiting_contact = True
            session.requested_part = serial
            session.state = ConversationState.COLLECT_CONTACT
            return {
                'type': 'text',
                'reply': f"❌ No part found with serial number: {serial}\n\n📞 Would you like to leave your contact info? We'll help you find this part.",
                'suggestions': ['Yes, contact me', 'Try another serial']
            }
    
    # Handle contact collection
    if session.state == ConversationState.COLLECT_CONTACT:
        if 'search another' in message.lower() or 'try another' in message.lower():
            # Reset to search method selection
            session.state = ConversationState.SEARCH_METHOD_SELECTION
            return {
                'type': 'text',
                'reply': "How would you like to search?\n\n1️⃣ By serial/part number\n2️⃣ By vehicle and part name",
                'suggestions': ['Search by serial number', 'Search by vehicle']
            }
        
        # Extract contact info
        contact_info = conv_manager.extract_contact_info(message)
        
        if contact_info.get('phone') or contact_info.get('email'):
            # Save contact request
            vehicle_info = {
                'brand': session.vehicle_brand,
                'model': session.vehicle_model,
                'year': session.vehicle_year
            }
            
            success = db.save_contact_request(
                session.session_id,
                contact_info.get('name', 'Customer'),
                contact_info.get('phone', ''),
                contact_info.get('email', ''),
                session.requested_part or 'Unknown part',
                vehicle_info
            )
            
            if success:
                session.state = ConversationState.COMPLETED
                return {
                    'type': 'text',
                    'reply': f"✅ Thank you! We've saved your contact information.\n\n📞 Phone: {contact_info.get('phone', 'Not provided')}\n📧 Email: {contact_info.get('email', 'Not provided')}\n\nWe'll contact you as soon as the part is available!\n\nIs there anything else I can help you with?",
                    'suggestions': ['Search another part', 'Track an order']
                }
        
        return {
            'type': 'text',
            'reply': "Please provide your phone number and/or email address so we can contact you when the part is available.\n\nExample: 0555123456 or email@example.com",
            'suggestions': []
        }
    
    # Handle order requests from results
    if session.state == ConversationState.SHOW_RESULTS:
        if 'order' in message.lower():
            session.state = ConversationState.COLLECT_CONTACT
            return {
                'type': 'text',
                'reply': "Great! To process your order, please provide your contact information (phone and/or email):",
                'suggestions': []
            }
        elif 'search another' in message.lower() or 'another part' in message.lower():
            session.state = ConversationState.SEARCH_METHOD_SELECTION
            return {
                'type': 'text',
                'reply': "How would you like to search?\n\n1️⃣ By serial/part number\n2️⃣ By vehicle and part name",
                'suggestions': ['Search by serial number', 'Search by vehicle']
            }
    
    # Handle completed state
    if session.state == ConversationState.COMPLETED:
        if 'search' in message.lower() or 'part' in message.lower():
            session.state = ConversationState.SEARCH_METHOD_SELECTION
            # Reset session data for new search
            session.search_method = None
            session.vehicle_brand = None
            session.vehicle_model = None
            session.vehicle_year = None
            session.part_name = None
            session.serial_number = None
            session.search_results = []
            session.awaiting_contact = False
            session.requested_part = None
            
            return {
                'type': 'text',
                'reply': "Let's start a new search!\n\nHow would you like to search?\n\n1️⃣ By serial/part number\n2️⃣ By vehicle and part name",
                'suggestions': ['Search by serial number', 'Search by vehicle']
            }
    
    # Default fallback
    return {
        'type': 'text',
        'reply': ai_response.get('response', "I'm not sure how to help with that. Would you like to search for spare parts?"),
        'suggestions': ['Search for parts', 'Track order', 'Contact support']
    }

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })







    
    
    
if __name__ == '__main__':
    print("🚀 Starting IMOBOT Server...")
    print("🌐 Frontend: http://127.0.0.1:5000")
    print("📍 API: http://127.0.0.1:5000/api/chat")

    app.run(host="0.0.0.0", port=5000, debug=True)
