import os
from dataclasses import dataclass

@dataclass
class Config:
    # Database
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '5432')
    DB_NAME = os.getenv('DB_NAME', 'product_db')
    DB_USER = os.getenv('DB_USER', 'postgres')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'nawel')
    
    # DeepSeek API
    DEEPSEEK_API_KEY = os.getenv('DEEPSEEK_API_KEY', 'hna thot api')
    DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
    
    # Flask
    FLASK_PORT = int(os.getenv('FLASK_PORT', '5000'))
    DEBUG = os.getenv('DEBUG', 'True').lower() == 'true'
    
    @property
    def DATABASE_URL(self):

        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
