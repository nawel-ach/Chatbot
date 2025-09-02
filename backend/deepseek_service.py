import requests
import json
from typing import Dict, List, Optional
from config import Config
from conversation_manager import ConversationState, SessionContext

class DeepSeekService:
    def __init__(self):
        self.config = Config()
        self.api_key = self.config.DEEPSEEK_API_KEY
        self.base_url = self.config.DEEPSEEK_BASE_URL
        
    def analyze_intent(self, message: str, context: SessionContext) -> Dict:
        """Analyze user intent using DeepSeek API"""
        
        system_prompt = self._build_system_prompt(context)
        
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 500
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_response = result['choices'][0]['message']['content']
                return self._parse_ai_response(ai_response, context)
            else:
                print(f"DeepSeek API error: {response.status_code}")
                return self._fallback_response(message, context)
                
        except Exception as e:
            print(f"DeepSeek service error: {e}")
            return self._fallback_response(message, context)
    
    def _build_system_prompt(self, context: SessionContext) -> str:
        """Build context-aware system prompt"""
        
        base_prompt = """You are IMOBOT, an AI assistant for an Algerian auto spare parts company. 
        Your job is to help customers find spare parts for their vehicles.
        
        Current conversation state: {state}
        
        Instructions based on state:
        """
        
        state_prompts = {
            ConversationState.WELCOME: """
                The user just started. Ask them how they want to search:
                1. By serial/part number (if they know it)
                2. By vehicle and part name
                
                Respond in JSON format:
                {
                    "intent": "welcome",
                    "next_state": "search_method_selection",
                    "response": "your friendly message"
                }
            """,
            
            ConversationState.SEARCH_METHOD_SELECTION: """
                Determine if user wants to search by:
                - Serial number (words like: serial, part number, reference, code)
                - Vehicle part (words like: brake, filter, battery, or mentions car brand/model)
                
                Respond in JSON format:
                {
                    "intent": "method_selected",
                    "search_method": "serial" or "part",
                    "next_state": "collect_serial" or "collect_vehicle_info",
                    "response": "your message"
                }
            """,
            
            ConversationState.COLLECT_VEHICLE_INFO: """
                Extract vehicle information from the message. Look for:
                - Brand (Toyota, Peugeot, Renault, etc.)
                - Model (Corolla, 308, Clio, etc.)
                - Year (1990-2024)
                
                Respond in JSON format:
                {
                    "intent": "vehicle_info",
                    "vehicle_brand": "extracted brand or null",
                    "vehicle_model": "extracted model or null",
                    "vehicle_year": "extracted year or null",
                    "next_state": "confirm_vehicle" if all info found else "collect_vehicle_info",
                    "response": "ask for missing info or confirm"
                }
            """,
            
            ConversationState.CONFIRM_VEHICLE: """
                User should confirm vehicle details.
                Current vehicle: {brand} {model} {year}
                
                If user says yes/correct/right/oui:
                {
                    "intent": "vehicle_confirmed",
                    "confirmed": true,
                    "next_state": "collect_part_name",
                    "response": "ask for part name"
                }
                
                If user says no/wrong/incorrect/non:
                {
                    "intent": "vehicle_rejected",
                    "confirmed": false,
                    "next_state": "collect_vehicle_info",
                    "response": "ask to re-enter vehicle info"
                }
            """,
            
            ConversationState.COLLECT_PART_NAME: """
                Extract the spare part name from the message.
                Common parts: brake pads, oil filter, air filter, battery, alternator, starter, etc.
                
                Respond in JSON format:
                {
                    "intent": "part_name",
                    "part_name": "extracted part name",
                    "next_state": "show_results",
                    "response": "confirming search"
                }
            """,
            
            ConversationState.COLLECT_SERIAL: """
                Extract serial/part number from the message.
                
                Respond in JSON format:
                {
                    "intent": "serial_number",
                    "serial": "extracted serial",
                    "next_state": "show_results",
                    "response": "searching for part"
                }
            """,
            
            ConversationState.COLLECT_CONTACT: """
                Extract contact information (phone, email, name).
                
                Respond in JSON format:
                {
                    "intent": "contact_info",
                    "phone": "extracted phone",
                    "email": "extracted email",
                    "name": "extracted name",
                    "next_state": "completed",
                    "response": "thank you message"
                }
            """
        }
        
        prompt = base_prompt.format(state=context.state.value)
        
        if context.state in state_prompts:
            specific_prompt = state_prompts[context.state]
            
            if context.state == ConversationState.CONFIRM_VEHICLE:
                specific_prompt = specific_prompt.format(
                    brand=context.vehicle_brand or "Unknown",
                    model=context.vehicle_model or "Unknown",
                    year=context.vehicle_year or "Unknown"
                )
            
            prompt += specific_prompt
        
        return prompt
    
    def _parse_ai_response(self, ai_response: str, context: SessionContext) -> Dict:
        """Parse AI response and extract structured data"""
        try:
            # Try to extract JSON substring
            if '{' in ai_response and '}' in ai_response:
                start = ai_response.index('{')
                end = ai_response.rindex('}') + 1
                json_str = ai_response[start:end]

                parsed = json.loads(json_str)
                if isinstance(parsed, dict):
                    return parsed
        except Exception as e:
            print(f"AI response parse error: {e} | raw: {ai_response}")

        # ✅ Always return dict fallback
        return {
            "intent": "unknown",
            "response": ai_response.strip(),
            "next_state": context.state.value,
            "vehicle_brand": None,
            "vehicle_model": None,
            "vehicle_year": None,
            "part_name": None,
            "serial": None,
            "phone": None,
            "email": None,
            "name": None
        }

        
    def _fallback_response(self, message: str, context: SessionContext) -> Dict:
        """Provide fallback response when API fails"""
        
        state_responses = {
            ConversationState.WELCOME: {
                "intent": "welcome",
                "next_state": "search_method_selection",
                "response": "Welcome! How would you like to search?\n1. By serial/part number\n2. By vehicle and part name"
            },
            ConversationState.SEARCH_METHOD_SELECTION: {
                "intent": "method_selected",
                "search_method": "part" if any(word in message.lower() for word in ['vehicle','car','brake','filter']) else "serial",
                "next_state": "collect_vehicle_info" if "vehicle" in message.lower() else "collect_serial",
                "response": "Please provide your vehicle details (brand, model, year)" if "vehicle" in message.lower() else "Please provide the serial number"
            },
            ConversationState.COLLECT_VEHICLE_INFO: {
                "intent": "vehicle_info",
                "vehicle_brand": None,
                "vehicle_model": None,
                "vehicle_year": None,
                "next_state": "collect_vehicle_info",
                "response": "I need your vehicle brand, model, and year (e.g., Toyota Corolla 2020)."
            },
            ConversationState.CONFIRM_VEHICLE: {
                "intent": "vehicle_confirmed" if "yes" in message.lower() or "correct" in message.lower() or "oui" in message.lower() else "vehicle_rejected",
                "confirmed": True if "yes" in message.lower() or "correct" in message.lower() or "oui" in message.lower() else False,
                "next_state": "collect_part_name" if "yes" in message.lower() or "correct" in message.lower() or "oui" in message.lower() else "collect_vehicle_info",
                "response": "Great! Now tell me which spare part you need." if "yes" in message.lower() or "correct" in message.lower() or "oui" in message.lower() else "Okay, please re-enter your vehicle details (brand, model, year)."
            },

            ConversationState.COLLECT_PART_NAME: {
                "intent": "part_name",
                "part_name": message,
                "next_state": "show_results",
                "response": f"Looking for {message}..."
            },
            ConversationState.COLLECT_SERIAL: {
                "intent": "serial_number",
                "serial": message,
                "next_state": "show_results",
                "response": f"Searching for part with serial {message}..."
            },
            ConversationState.COLLECT_CONTACT: {
                "intent": "contact_info",
                "phone": None,
                "email": None,
                "name": None,
                "next_state": "completed",
                "response": "Please share your phone or email so we can contact you."
            },
        }
        
        return state_responses.get(context.state, {
            "intent": "unknown",
            "response": "I understand. How can I help you find spare parts?",
            "next_state": context.state.value
        })

    
    def generate_natural_response(self, parts: List[Dict], context: SessionContext) -> str:
        """Generate natural language response for search results"""
        
        if not parts:
            return "I couldn't find any parts matching your search. Would you like to leave your contact information so we can notify you when it becomes available?"
        
        if len(parts) == 1:
            part = parts[0]
            qty = part.get('quantity_on_hand', 0)
            price = part.get('sales_price', 0)
            
            if qty > 0:
                return f"✅ Great news! I found {part['product_name']}.\n\n📦 In stock: {qty} units\n💰 Price: {price:.2f} DZD\n\nWould you like to order this part?"
            else:
                return f"⚠️ I found {part['product_name']}, but it's currently out of stock.\n\nWould you like to leave your contact information? We'll notify you as soon as it's available."
        
        # Multiple parts found
        response = f"I found {len(parts)} matching parts:\n\n"
        for i, part in enumerate(parts[:5], 1):
            qty = part.get('quantity_on_hand', 0)
            price = part.get('sales_price', 0)
            status = "✅ In stock" if qty > 0 else "❌ Out of stock"
            
            response += f"{i}. {part['product_name']}\n"
            response += f"   Serial: {part['internal_reference']}\n"
            response += f"   {status} ({qty} units)\n"
            response += f"   Price: {price:.2f} DZD\n\n"
        
        return response + "\nWhich part are you interested in?"