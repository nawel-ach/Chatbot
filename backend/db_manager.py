import psycopg2
from psycopg2.extras import RealDictCursor
import json
from datetime import datetime
from typing import List, Dict, Optional
from config import Config

class DatabaseManager:
    def __init__(self):
        self.config = Config()
        self.connection = None
        self.connect()
    
    def connect(self):
        """Establish database connection"""
        try:
            self.connection = psycopg2.connect(
                host=self.config.DB_HOST,
                port=self.config.DB_PORT,
                database=self.config.DB_NAME,
                user=self.config.DB_USER,
                password=self.config.DB_PASSWORD
            )
            print("✅ Database connected successfully")
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            raise
    
    def ensure_connection(self):
        """Ensure database connection is alive"""
        if self.connection is None or self.connection.closed:
            self.connect()
    
    def search_parts_by_name(self, query: str, limit: int = 10) -> List[Dict]:
        """Search parts by name or description"""
        self.ensure_connection()
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                # Use ILIKE for case-insensitive search
                sql = """
                    SELECT internal_reference, product_name, quantity_on_hand, sales_price
                    FROM products
                    WHERE product_name ILIKE %s
                    ORDER BY 
                        CASE 
                            WHEN product_name ILIKE %s THEN 0
                            ELSE 1
                        END,
                        product_name
                    LIMIT %s
                """
                search_pattern = f'%{query}%'
                exact_pattern = query
                cursor.execute(sql, (search_pattern, exact_pattern, limit))
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            print(f"Error searching parts: {e}")
            return []
    
    def search_by_serial(self, serial: str) -> Optional[Dict]:
        """Search part by exact serial number"""
        self.ensure_connection()
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                sql = """
                    SELECT internal_reference, product_name, quantity_on_hand, sales_price
                    FROM products
                    WHERE internal_reference = %s
                """
                cursor.execute(sql, (serial,))
                result = cursor.fetchone()
                return dict(result) if result else None
        except Exception as e:
            print(f"Error searching by serial: {e}")
            return None
    
    def search_parts_for_vehicle(self, brand: str, model: str, year: str, part_name: str) -> List[Dict]:
        """Search parts for specific vehicle"""
        self.ensure_connection()
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                # Build search query combining vehicle info and part name
                search_terms = []
                if brand:
                    search_terms.append(brand)
                if model:
                    search_terms.append(model)
                if part_name:
                    search_terms.append(part_name)
                
                # Create search pattern
                search_query = ' '.join(search_terms)
                
                sql = """
                    SELECT internal_reference, product_name, quantity_on_hand, sales_price
                    FROM products
                    WHERE product_name ILIKE %s
                    ORDER BY 
                        CASE 
                            WHEN product_name ILIKE %s THEN 0
                            WHEN product_name ILIKE %s THEN 1
                            ELSE 2
                        END,
                        product_name
                    LIMIT 20
                """
                
                search_pattern = f'%{search_query}%'
                part_pattern = f'%{part_name}%' if part_name else '%'
                brand_pattern = f'%{brand}%' if brand else '%'
                
                cursor.execute(sql, (search_pattern, part_pattern, brand_pattern))
                results = cursor.fetchall()
                return [dict(row) for row in results]
        except Exception as e:
            print(f"Error searching for vehicle parts: {e}")
            return []
    
    def save_chat_session(self, session_id: str, user_ip: str = None, user_agent: str = None):
        """Create or update chat session"""
        self.ensure_connection()
        try:
            with self.connection.cursor() as cursor:
                sql = """
                    INSERT INTO chat_sessions (session_id, user_ip, user_agent)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (session_id) DO UPDATE
                    SET user_ip = EXCLUDED.user_ip,
                        user_agent = EXCLUDED.user_agent
                """
                cursor.execute(sql, (session_id, user_ip, user_agent))
                self.connection.commit()
        except Exception as e:
            print(f"Error saving chat session: {e}")
            self.connection.rollback()
    
    def save_message(self, session_id: str, role: str, message: str, metadata: Dict = None):
        """Save chat message to history"""
        self.ensure_connection()
        try:
            with self.connection.cursor() as cursor:
                sql = """
                    INSERT INTO chat_messages (session_id, role, message, metadata)
                    VALUES (%s, %s, %s, %s)
                """
                metadata_json = json.dumps(metadata) if metadata else None
                cursor.execute(sql, (session_id, role, message, metadata_json))
                self.connection.commit()
        except Exception as e:
            print(f"Error saving message: {e}")
            self.connection.rollback()
    
    def save_contact_request(self, session_id: str, customer_name: str, phone: str, 
                           email: str, requested_part: str, vehicle_info: Dict = None):
        """Save customer contact request"""
        self.ensure_connection()
        try:
            with self.connection.cursor() as cursor:
                sql = """
                    INSERT INTO contact_requests 
                    (session_id, customer_name, phone, email, requested_part, vehicle_info)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """
                vehicle_json = json.dumps(vehicle_info) if vehicle_info else None
                cursor.execute(sql, (session_id, customer_name, phone, email, requested_part, vehicle_json))
                self.connection.commit()
                return True
        except Exception as e:
            print(f"Error saving contact request: {e}")
            self.connection.rollback()
            return False
    
    def get_chat_history(self, session_id: str, limit: int = 10) -> List[Dict]:
        """Get recent chat history for a session"""
        self.ensure_connection()
        try:
            with self.connection.cursor(cursor_factory=RealDictCursor) as cursor:
                sql = """
                    SELECT role, message, timestamp, metadata
                    FROM chat_messages
                    WHERE session_id = %s
                    ORDER BY timestamp DESC
                    LIMIT %s
                """
                cursor.execute(sql, (session_id, limit))
                results = cursor.fetchall()
                return [dict(row) for row in reversed(results)]
        except Exception as e:
            print(f"Error getting chat history: {e}")
            return []
    
    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()