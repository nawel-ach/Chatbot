from enum import Enum
from typing import Dict, Optional, List
from dataclasses import dataclass, field
import re

class ConversationState(Enum):
    WELCOME = "welcome"
    SEARCH_METHOD_SELECTION = "search_method_selection"
    COLLECT_VEHICLE_INFO = "collect_vehicle_info"
    CONFIRM_VEHICLE = "confirm_vehicle"
    COLLECT_PART_NAME = "collect_part_name"
    COLLECT_SERIAL = "collect_serial"
    SHOW_RESULTS = "show_results"
    COLLECT_CONTACT = "collect_contact"
    COMPLETED = "completed"

@dataclass
class SessionContext:
    session_id: str
    state: ConversationState = ConversationState.WELCOME
    search_method: Optional[str] = None  # 'serial' or 'part'
    vehicle_brand: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[str] = None
    part_name: Optional[str] = None
    serial_number: Optional[str] = None
    search_results: List[Dict] = field(default_factory=list)
    awaiting_contact: bool = False
    requested_part: Optional[str] = None
    
class ConversationManager:
    def __init__(self):
        self.sessions: Dict[str, SessionContext] = {}
    
    def get_or_create_session(self, session_id: str) -> SessionContext:
        """Get existing session or create new one"""
        if session_id not in self.sessions:
            self.sessions[session_id] = SessionContext(session_id=session_id)
        return self.sessions[session_id]
    
    def update_state(self, session_id: str, new_state: ConversationState):
        """Update conversation state"""
        session = self.get_or_create_session(session_id)
        session.state = new_state
    
    def extract_vehicle_info(self, text: str) -> Dict:
        """Extract vehicle information from text"""
        # Common patterns for extracting vehicle info
        year_pattern = r'\b(19\d{2}|20\d{2})\b'
        
        # Extract year
        year_match = re.search(year_pattern, text)
        year = year_match.group(1) if year_match else None
        
        # Common car brands in Algeria
        brands = ['toyota', 'peugeot', 'renault', 'volkswagen', 'hyundai', 'kia', 
                 'nissan', 'ford', 'citroen', 'dacia', 'seat', 'skoda', 'suzuki',
                 'mercedes', 'bmw', 'audi', 'chevrolet', 'fiat', 'opel']
        
        brand = None
        model = None
        text_lower = text.lower()
        
        for b in brands:
            if b in text_lower:
                brand = b.capitalize()
                # Try to extract model (word after brand)
                pattern = f'{b}\\s+(\\w+)'
                match = re.search(pattern, text_lower)
                if match:
                    model = match.group(1).capitalize()
                break
        
        return {
            'brand': brand,
            'model': model,
            'year': year
        }
    
    def extract_contact_info(self, text: str) -> Dict:
        """Extract contact information from text"""
        # Phone pattern (Algerian format)
        phone_pattern = r'(?:\+213|0)?[567]\d{8}'
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        
        phone_match = re.search(phone_pattern, text)
        email_match = re.search(email_pattern, text)
        
        return {
            'phone': phone_match.group(0) if phone_match else None,
            'email': email_match.group(0) if email_match else None,
            'name': None  # Could be enhanced with name extraction
        }
    
    def format_vehicle_string(self, session: SessionContext) -> str:
        """Format vehicle information as string"""
        parts = []
        if session.vehicle_brand:
            parts.append(session.vehicle_brand)
        if session.vehicle_model:
            parts.append(session.vehicle_model)
        if session.vehicle_year:
            parts.append(session.vehicle_year)
        return ' '.join(parts) if parts else 'Unknown vehicle'