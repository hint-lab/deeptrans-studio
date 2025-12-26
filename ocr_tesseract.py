# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify
import pytesseract
from PIL import Image
import io
import requests
from urllib.parse import urlparse
import logging
from datetime import datetime, timedelta
import os
import json
import secrets
import hashlib
from functools import wraps
import base64
import time
import hmac
import uuid
from flasgger import Swagger, swag_from
# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False

# ============ Flasgger 配置 ============
swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": 'ocr_api_spec',
            "route": '/api/v1/apispec.json',
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/docs/",  # 文档访问路径
    "title": "OCR API 文档",
    "version": "1.0.0",
    "description": """
    OCR文字识别服务API文档
    ### 主要功能
    - 支持通过URL识别图片中的文字
    - 多语言识别（中英文等）
    - 批量图片处理
    - 客户端认证与令牌管理
    ### 使用流程
    1. 使用 client_id/client_secret 在 `/api/v1/auth/token` 获取令牌
    2. 在请求头中添加 `Authorization: Bearer <your_token>`
    3. 调用OCR相关接口
    """
}

# 初始化Swagger
swagger = Swagger(app, config=swagger_config, template=swagger_config)
# 辅助函数：安全获取Tesseract版本
def get_tesseract_version_str() -> str:
    """安全地获取Tesseract版本字符串"""
    try:
        version = pytesseract.get_tesseract_version()
        return str(version)
    except Exception as e:
        logger.warning(f"获取Tesseract版本失败: {str(e)}")
        return "unknown"

# 响应格式化函数
def format_response(success=True, message=None, data=None, error=None, **kwargs):
    """格式化API响应"""
    response = {
        'success': success,
        'timestamp': datetime.now().isoformat()
    }

    if message:
        response['message'] = message
    if data is not None:
        response['data'] = data
    if error:
        response['error'] = error

    for key, value in kwargs.items():
        if value is not None:
            response[key] = value

    return response

#def json_response(success=True, message=None, data=None, error=None, status_code=200, **kwargs):
#    """返回JSON响应"""
#    response_data = format_response(success, message, data, error, **kwargs)
#    return jsonify(response_data), status_code
def json_response(success=True, message=None, data=None, error=None, status_code=200, **kwargs):
    """返回JSON响应"""
    response_data = format_response(success, message, data, error, **kwargs)

    # 使用Response而不是jsonify
    import json
    response_json = json.dumps(
        response_data,
        ensure_ascii=False,
        indent=2 if app.debug else None
    )

    from flask import Response
    return Response(
        response_json,
        status=status_code,
        mimetype='application/json; charset=utf-8'
    )

# 配置
class Config:
    # 应用配置
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'}
    MAX_IMAGE_SIZE = 8192
    TIMEOUT = 10

    # 认证配置
    AUTH_ENABLED = os.environ.get('AUTH_ENABLED', 'True').lower() == 'true'
    TOKEN_EXPIRATION_HOURS = int(os.environ.get('TOKEN_EXPIRATION_HOURS', 24))
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_hex(32))

    # 客户端配置
    CLIENT_STORE_FILE = os.environ.get('CLIENT_STORE_FILE', 'clients.json')

    # 公开端点
    PUBLIC_ENDPOINTS = [
        '/api/v1/health',
        '/api/v1/auth/token',
        '/',
        '/api/v1/test/ocr'
    ]

app.config.from_object(Config)

# 令牌存储
token_store = {}

# 客户端存储类
class ClientStore:
    def __init__(self):
        self.clients_file = app.config['CLIENT_STORE_FILE']
        self.clients = self.load_clients()

        if not self.clients:
            self.init_default_client()

    def load_clients(self) -> dict:
        """从文件加载客户端数据"""
        try:
            if os.path.exists(self.clients_file):
                with open(self.clients_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"加载客户端文件失败: {str(e)}")
        return {}

    def save_clients(self):
        """保存客户端数据到文件"""
        try:
            with open(self.clients_file, 'w') as f:
                json.dump(self.clients, f, indent=2)
        except Exception as e:
            logger.error(f"保存客户端文件失败: {str(e)}")

    def init_default_client(self):
        """初始化默认客户端"""
        client_id = "default_client"
        client_secret = secrets.token_urlsafe(32)

        self.clients[client_id] = {
            'client_secret_hash': self.hash_secret(client_secret),
            'name': '默认客户端',
            'description': '系统默认客户端',
            'created_at': datetime.now().isoformat(),
            'is_active': True,
            'rate_limit': 100,
            'scopes': ['ocr:read', 'ocr:batch'],
            'metadata': {
                'owner': 'system',
                'contact': 'admin@example.com'
            }
        }
        self.save_clients()

        logger.info(f"已创建默认客户端 - ID: {client_id}")
        logger.info(f"默认客户端密钥: {client_secret}")
        logger.warning("请在生产环境中修改默认客户端密钥！")

    def hash_secret(self, secret: str) -> str:
        """哈希加密密钥"""
        salt = os.urandom(16)
        return hashlib.pbkdf2_hmac(
            'sha256',
            secret.encode('utf-8'),
            salt,
            100000
        ).hex() + '.' + salt.hex()

    def verify_secret(self, secret: str, stored_hash: str) -> bool:
        """验证密钥"""
        try:
            hash_part, salt_hex = stored_hash.split('.')
            salt = bytes.fromhex(salt_hex)

            new_hash = hashlib.pbkdf2_hmac(
                'sha256',
                secret.encode('utf-8'),
                salt,
                100000
            ).hex()

            return secrets.compare_digest(new_hash, hash_part)
        except:
            return False

    def validate_client(self, client_id: str, client_secret: str) -> bool:
        """验证客户端凭证"""
        if client_id not in self.clients:
            return False

        client = self.clients[client_id]

        if not client.get('is_active', True):
            return False

        stored_hash = client.get('client_secret_hash')
        if not stored_hash:
            return False

        return self.verify_secret(client_secret, stored_hash)

    def get_client_info(self, client_id: str):
        """获取客户端信息"""
        if client_id not in self.clients:
            return None

        client = self.clients[client_id].copy()
        client.pop('client_secret_hash', None)
        return client

# 初始化客户端存储
client_store = ClientStore()

# 令牌管理函数
def create_token(client_id: str) -> str:
    """创建访问令牌"""
    token_id = str(uuid.uuid4())
    expires_at = int(time.time()) + app.config['TOKEN_EXPIRATION_HOURS'] * 3600

    message = f"{client_id}:{token_id}:{expires_at}"
    signature = hmac.new(
        app.config['JWT_SECRET_KEY'].encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()

    client_id_encoded = base64.urlsafe_b64encode(client_id.encode()).decode().rstrip('=')
    token = f"{client_id_encoded}.{token_id}.{expires_at}.{signature}"

    token_store[token] = {
        'client_id': client_id,
        'token_id': token_id,
        'expires_at': expires_at,
        'created_at': int(time.time())
    }

    return token

def validate_token(token: str) -> dict:
    """验证访问令牌"""
    try:
        parts = token.split('.')
        if len(parts) != 4:
            return None

        client_id_encoded, token_id, expires_at_str, signature = parts
        client_id = base64.urlsafe_b64decode(client_id_encoded + '=' * (4 - len(client_id_encoded) % 4)).decode()

        message = f"{client_id}:{token_id}:{expires_at_str}"
        expected_signature = hmac.new(
            app.config['JWT_SECRET_KEY'].encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_signature):
            return None

        expires_at = int(expires_at_str)
        if time.time() > expires_at:
            return None

        if token in token_store:
            stored_info = token_store[token]
            if stored_info['client_id'] != client_id or stored_info['token_id'] != token_id:
                return None

        return {
            'client_id': client_id,
            'token_id': token_id,
            'expires_at': expires_at
        }

    except Exception as e:
        logger.error(f"令牌验证失败: {str(e)}")
        return None

# 认证装饰器
def requires_auth(f):
    """认证装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not app.config['AUTH_ENABLED']:
            return f(*args, **kwargs)

        if request.path in app.config['PUBLIC_ENDPOINTS']:
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization')

        if not auth_header:
            return json_response(
                success=False,
                error="需要认证信息",
                message="请提供Authorization头",
                status_code=401
            )

        if not auth_header.startswith('Bearer '):
            return json_response(
                success=False,
                error="令牌格式不正确",
                message="应为Bearer token格式",
                status_code=401
            )

        token = auth_header[7:]
        token_info = validate_token(token)

        if not token_info:
            return json_response(
                success=False,
                error="无效或过期的令牌",
                message="请重新获取访问令牌",
                status_code=401
            )

        client_id = token_info['client_id']

        if client_id not in client_store.clients:
            return json_response(
                success=False,
                error="客户端不存在",
                message="客户端ID无效",
                status_code=401
            )

        client = client_store.clients[client_id]
        if not client.get('is_active', True):
            return json_response(
                success=False,
                error="客户端已被停用",
                message="请联系管理员",
                status_code=403
            )

        request.client_id = client_id
        return f(*args, **kwargs)

    return decorated

# 健康检查端点
@app.route('/api/v1/health', methods=['GET'])
def health_check():
    """
    服务健康检查
    ---
    tags:
      - 服务信息
    summary: 检查服务运行状态
    description: |
      检查OCR API服务的运行状态，包括Tesseract引擎可用性和认证系统状态。

      **检查项**：
      - Tesseract OCR引擎
      - 认证系统状态
      - 客户端数量
      - 活跃令牌数
    responses:
      200:
        description: 服务运行正常
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            message:
              type: string
              example: "服务运行正常"
            data:
              type: object
              properties:
                tesseract_version:
                  type: string
                  example: "5.3.0"
                auth_enabled:
                  type: boolean
                  example: true
                total_clients:
                  type: integer
                  example: 3
                active_tokens:
                  type: integer
                  example: 5
      503:
        description: 服务异常
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: false
            error:
              type: string
              example: "服务异常"
            message:
              type: string
              example: "Tesseract初始化失败"
    """
    try:
        test_image = Image.new('RGB', (100, 50), color='white')
        pytesseract.image_to_string(test_image, lang='eng')

        return json_response(
            success=True,
            message="服务运行正常",
            data={
                'tesseract_version': get_tesseract_version_str(),
                'auth_enabled': app.config['AUTH_ENABLED'],
                'total_clients': len(client_store.clients),
                'active_tokens': len(token_store)
            }
        )
    except Exception as e:
        return json_response(
            success=False,
            error="服务异常",
            message=str(e),
            status_code=503
        )

# 获取访问令牌
@app.route('/api/v1/auth/token', methods=['POST'])
def get_access_token():
    """
    获取API访问令牌
    ---
    tags:
      - 认证管理
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        description: 通过JSON传递凭证
        schema:
          type: object
          properties:
            client_id:
              type: string
            client_secret:
              type: string
    responses:
      200:
        description: 令牌获取成功
        schema:
          properties:
            access_token:
              type: string
            token_type:
              type: string
            expires_in:
              type: integer
        examples:
          application/json:
            access_token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
            token_type: "Bearer"
            expires_in: 86400
      400:
        description: 缺少必要的凭证参数
      401:
        description: 无效的客户端凭证
    """
    try:
        client_id = None
        client_secret = None

        # 首先尝试Basic Auth
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Basic '):
            try:
                decoded = base64.b64decode(auth_header[6:]).decode('utf-8')
                client_id, client_secret = decoded.split(':', 1)
            except:
                pass

        # 尝试从JSON体获取
        if not client_id or not client_secret:
            if request.is_json:
                data = request.get_json()
                client_id = data.get('client_id')
                client_secret = data.get('client_secret')

        # 尝试表单数据
        if not client_id or not client_secret:
            client_id = request.form.get('client_id')
            client_secret = request.form.get('client_secret')

        if not client_id or not client_secret:
            return json_response(
                success=False,
                error="缺少客户端凭证",
                message="请提供client_id和client_secret",
                status_code=400
            )

        # 验证客户端凭证
        if not client_store.validate_client(client_id, client_secret):
            return json_response(
                success=False,
                error="无效的客户端凭证",
                message="请检查client_id和client_secret",
                status_code=401
            )

        # 创建访问令牌
        token = create_token(client_id)
        expires_at = time.time() + app.config['TOKEN_EXPIRATION_HOURS'] * 3600

        return json_response(
            success=True,
            message="令牌生成成功",
            data={
                'access_token': token,
                'token_type': 'Bearer',
                'expires_in': app.config['TOKEN_EXPIRATION_HOURS'] * 3600,
                'expires_at': datetime.fromtimestamp(expires_at).isoformat() + 'Z',
                'client_id': client_id
            }
        )

    except Exception as e:
        logger.error(f"令牌生成失败: {str(e)}")
        return json_response(
            success=False,
            error="服务器内部错误",
            message=str(e) if app.debug else "请稍后重试",
            status_code=500
        )

# 语言列表端点
@app.route('/api/v1/languages', methods=['GET'])
@requires_auth
def list_languages():
    """
    获取OCR支持的语言列表
    ---
    tags:
      - OCR配置管理
    security:
      - BearerAuth: []
    summary: 获取所有支持的语言
    description: |
      返回Tesseract OCR支持的所有语言列表，包含语言代码和中英文名称映射。

      **注意**：
      - 需要认证令牌
      - 返回的语言代码可直接用于OCR识别的language参数
      - 支持多语言组合，使用+连接语言代码

      **令牌格式示例**：
      ```
      Authorization: Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a
      ```
    parameters:
      - in: header
        name: Authorization
        type: string
        required: true
        description: |
          Bearer令牌认证头

          **格式**：`Bearer <your_access_token>`

          **令牌结构**：`base64(client_id).uuid.expires_at.signature`

          **完整示例**：
          ```
          Authorization: Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a
          ```
        default: "Bearer "
        example: "Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a"
    responses:
      200:
        description: 语言列表获取成功
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            message:
              type: string
              example: "共支持 50 种语言"
            data:
              type: object
              properties:
                languages:
                  type: array
                  items:
                    type: object
                    properties:
                      code:
                        type: string
                        example: "chi_sim"
                      name:
                        type: string
                        example: "简体中文"
                      description:
                        type: string
                        example: "Tesseract chi_sim 语言包"
                total:
                  type: integer
                  example: 50
                default:
                  type: string
                  example: "eng"
                multi_language:
                  type: string
                  example: "支持使用+连接多个语言，如: chi_sim+eng"
            client_id:
              type: string
              example: "default_client"
      401:
        description: |
          认证失败

          **可能原因**：
          - 缺少Authorization头
          - 令牌格式不正确（应为Bearer token格式）
          - 令牌已过期
          - 无效的令牌

          **正确的格式示例**：
          ```
          Authorization: Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a
          ```
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: false
            error:
              type: string
              example: "令牌格式不正确"
            message:
              type: string
              example: "应为Bearer token格式，如: Bearer ZGVmYXVsdF9jbGllbnQ.xxx"
      500:
        description: 服务器内部错误
    x-code-samples:
      - lang: curl
        source: |
          # 使用默认客户端生成的token
          curl -X GET "http://localhost:5000/api/v1/languages" \
            -H "Authorization: Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a" \
            -H "Content-Type: application/json"
      - lang: Python
        source: |
          import requests

          # 使用正确的Bearer令牌格式
          token = "ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a"

          headers = {
              'Authorization': f'Bearer {token}',
              'Content-Type': 'application/json'
          }

          response = requests.get(
              'http://localhost:5000/api/v1/languages',
              headers=headers
          )

          print(response.json())
      - lang: JavaScript
        source: |
          // 确保使用正确的Bearer令牌格式
          const token = 'ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a';

          fetch('http://localhost:5000/api/v1/languages', {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
              }
          })
          .then(response => response.json())
          .then(data => console.log(data));
    """
    try:
        langs = pytesseract.get_languages(config='')

        # 常见语言的中文名称映射
        language_names = {
            'eng': '英文',
            'chi_sim': '简体中文',
            'chi_tra': '繁体中文',
            'jpn': '日文',
            'kor': '韩文',
            'fra': '法文',
            'deu': '德文',
            'spa': '西班牙文',
            'por': '葡萄牙文',
            'ita': '意大利文',
            'rus': '俄文',
            'ara': '阿拉伯文',
            'hin': '印地文',
            'ben': '孟加拉文',
            'ces': '捷克文',
            'dan': '丹麦文',
            'nld': '荷兰文',
            'fin': '芬兰文',
            'ell': '希腊文',
            'heb': '希伯来文',
            'hun': '匈牙利文',
            'ind': '印度尼西亚文',
            'lav': '拉脱维亚文',
            'lit': '立陶宛文',
            'nor': '挪威文',
            'pol': '波兰文',
            'ron': '罗马尼亚文',
            'slk': '斯洛伐克文',
            'slv': '斯洛文尼亚文',
            'swe': '瑞典文',
            'tam': '泰米尔文',
            'tel': '泰卢固文',
            'tha': '泰文',
            'tur': '土耳其文',
            'ukr': '乌克兰文',
            'vie': '越南文'
        }

        languages = []
        for lang in langs:
            languages.append({
                'code': lang,
                'name': language_names.get(lang, lang),
                'description': f'Tesseract {lang} 语言包'
            })

        return json_response(
            success=True,
            message=f"共支持 {len(langs)} 种语言",
            data={
                'languages': languages,
                'total': len(langs),
                'default': 'eng',
                'multi_language': '支持使用+连接多个语言，如: chi_sim+eng'
            },
            client_id=getattr(request, 'client_id', 'unknown')
        )
    except Exception as e:
        logger.error(f"获取语言列表失败: {str(e)}")
        return json_response(
            success=False,
            error="获取语言列表失败",
            message=str(e),
            status_code=500,
            client_id=getattr(request, 'client_id', 'unknown')
        )

# 测试OCR端点
@app.route('/api/v1/test/ocr', methods=['POST'])
def test_ocr():
    """
    测试OCR功能
    ---
    tags:
      - 测试功能
    summary: 无需认证的OCR测试接口
    description: |
      提供无需认证的OCR功能测试，适用于快速验证服务可用性。

      **注意**：
      - 无需认证令牌
      - 仅支持简单参数
      - 适用于开发测试和功能验证
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - file_url
          properties:
            file_url:
              type: string
              format: uri
              example: "https://example.com/test.png"
              description: 测试图片URL
    responses:
      200:
        description: 测试成功
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            message:
              type: string
              example: "OCR识别成功"
            data:
              type: object
              properties:
                text:
                  type: string
                  example: "Hello World"
                image_size:
                  type: array
                  items:
                    type: integer
                  example: [800, 600]
                image_mode:
                  type: string
                  example: "RGB"
                character_count:
                  type: integer
                  example: 11
                word_count:
                  type: integer
                  example: 2
      400:
        description: 请求参数错误或图片下载失败
      500:
        description: OCR处理失败
    """
    try:
        data = request.get_json()

        if not data or 'file_url' not in data:
            return json_response(
                success=False,
                error="缺少参数",
                message="需要file_url参数",
                status_code=400
            )

        file_url = data['file_url']

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(file_url, headers=headers, timeout=10)
        response.raise_for_status()

        image_data = io.BytesIO(response.content)
        image = Image.open(image_data)

        text = pytesseract.image_to_string(image, lang='eng')

        return json_response(
            success=True,
            message="OCR识别成功",
            data={
                'text': text.strip(),
                'image_size': image.size,
                'image_mode': image.mode,
                'character_count': len(text.strip()),
                'word_count': len(text.strip().split())
            }
        )

    except requests.exceptions.RequestException as e:
        return json_response(
            success=False,
            error="图片下载失败",
            message=str(e),
            status_code=400
        )
    except Exception as e:
        return json_response(
            success=False,
            error="OCR处理失败",
            message=str(e),
            status_code=500
        )

# 主OCR端点
@app.route('/api/v1/ocr/url', methods=['POST'])
@requires_auth
def ocr_from_url():
    """
    通过图片URL进行OCR文字识别
    ---
    tags:
      - OCR核心功能
    security:
      - Bearer: []
    parameters:
      - in: header
        name: Authorization
        type: string
        required: true
        description: |
          Bearer令牌认证头

          **格式**：`Bearer <your_access_token>`

          **令牌结构**：`base64(client_id).uuid.expires_at.signature`

          **完整示例**：
          ```
          Authorization: Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a
          ```
        default: "Bearer "
        example: "Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a"
      - in: body
        name: body
        required: true
        schema:
          id: OcrRequest
          required:
            - file_url
          properties:
            file_url:
              type: string
              format: uri
              example: "https://tesseract.projectnaptha.com/img/eng_bw.png"
              description: 待识别图片的公开URL
            language:
              type: string
              default: "eng"
              example: "eng"
              description: 识别语言代码，支持多语言用+连接
    responses:
      200:
        description: OCR识别成功
        schema:
          id: OcrResponse
          properties:
            success:
              type: boolean
            message:
              type: string
            data:
              type: object
              properties:
                ocr_result:
                  type: object
                  properties:
                    text:
                      type: string
                    confidence:
                      type: number
                      format: float
                    character_count:
                      type: integer
                    word_count:
                      type: integer
                image_info:
                  type: object
                parameters:
                  type: object
            client_id:
              type: string
        examples:
          application/json:
            success: true
            message: "OCR识别完成"
            data:
              ocr_result:
                text: "识别出的文字内容"
                confidence: 95.5
                character_count: 10
                word_count: 2
            client_id: "default_client"
      400:
        description: 请求参数无效或图片URL错误
      401:
        description: 认证失败
      500:
        description: 服务器内部错误
    """
    try:
        data = request.get_json()

        if not data or 'file_url' not in data:
            return json_response(
                success=False,
                error="缺少参数",
                message="需要file_url参数",
                status_code=400,
                client_id=getattr(request, 'client_id', 'unknown')
            )

        file_url = data['file_url']

        # 验证URL
        try:
            result = urlparse(file_url)
            if not all([result.scheme in ['http', 'https'], result.netloc]):
                return json_response(
                    success=False,
                    error="无效的URL",
                    message="URL格式不正确",
                    status_code=400,
                    client_id=getattr(request, 'client_id', 'unknown')
                )
        except:
            return json_response(
                success=False,
                error="无效的URL",
                message="URL格式不正确",
                status_code=400,
                client_id=getattr(request, 'client_id', 'unknown')
            )

        # 获取参数
        lang = data.get('language', 'eng')
        psm = data.get('psm', '6')
        oem = data.get('oem', '3')

        logger.info(f"客户端 {getattr(request, 'client_id', 'unknown')} 请求OCR: {file_url}")

        # 下载图片
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }

        response = requests.get(file_url, headers=headers, timeout=10, stream=True)
        response.raise_for_status()

        # 检查内容类型
        content_type = response.headers.get('content-type', '')
        if 'image' not in content_type:
            logger.warning(f"URL返回的不是图片: {content_type}")

        # 检查文件大小
        content_length = response.headers.get('content-length')
        if content_length and int(content_length) > app.config['MAX_CONTENT_LENGTH']:
            return json_response(
                success=False,
                error="图片太大",
                message=f"图片大小超过限制: {content_length}字节",
                status_code=400,
                client_id=getattr(request, 'client_id', 'unknown')
            )

        # 读取图片数据
        image_data = io.BytesIO(response.content)
        image = Image.open(image_data)

        # 验证图片尺寸
        if max(image.size) > app.config['MAX_IMAGE_SIZE']:
            return json_response(
                success=False,
                error="图片尺寸过大",
                message=f"图片尺寸超过限制: {image.size}",
                status_code=400,
                client_id=getattr(request, 'client_id', 'unknown')
            )

        # 转换格式
        if image.mode not in ['1', 'L', 'RGB', 'RGBA']:
            image = image.convert('RGB')

        # 预处理图片
        if image.mode != 'L':
            processed_image = image.convert('L')
        else:
            processed_image = image

        # 执行OCR
        config = f'--psm {psm} --oem {oem}'
        text = pytesseract.image_to_string(processed_image, lang=lang, config=config)

        # 获取置信度
        ocr_data = pytesseract.image_to_data(
            processed_image,
            lang=lang,
            config=config,
            output_type=pytesseract.Output.DATAFRAME
        )

        confidence = ocr_data['conf'].mean() if not ocr_data.empty else 0

        return json_response(
            success=True,
            message="OCR识别完成",
            data={
                'ocr_result': {
                    'text': text.strip(),
                    'confidence': float(confidence),
                    'character_count': len(text.strip()),
                    'word_count': len(text.strip().split())
                },
                'image_info': {
                    'size': image.size,
                    'mode': image.mode,
                    'format': image.format
                },
                'parameters': {
                    'file_url': file_url,
                    'language': lang,
                    'psm': psm,
                    'oem': oem
                }
            },
            client_id=getattr(request, 'client_id', 'unknown')
        )

    except requests.exceptions.Timeout:
        return json_response(
            success=False,
            error="请求超时",
            message="下载图片超时",
            status_code=408,
            client_id=getattr(request, 'client_id', 'unknown')
        )
    except requests.exceptions.RequestException as e:
        return json_response(
            success=False,
            error="网络错误",
            message=f"下载失败: {str(e)}",
            status_code=502,
            client_id=getattr(request, 'client_id', 'unknown')
        )
    except Exception as e:
        logger.error(f"OCR处理错误: {str(e)}")
        return json_response(
            success=False,
            error="处理失败",
            message=str(e) if app.debug else "服务器内部错误",
            status_code=500,
            client_id=getattr(request, 'client_id', 'unknown')
        )

# 批量OCR端点
@app.route('/api/v1/ocr/batch', methods=['POST'])
@requires_auth
def ocr_batch_urls():
    """
    批量OCR文字识别
    ---
    tags:
      - OCR核心功能
    security:
      - Bearer: []
    summary: 批量处理多个图片URL
    description: |
      同时处理最多10个图片URL的OCR识别，支持统一语言设置。

      **限制**：
      - 单次请求最多10个URL
      - 每个URL需要符合图片格式要求
      - 所有图片使用相同的语言设置
    parameters:
      - in: header
        name: Authorization
        type: string
        required: true
        description: |
          Bearer令牌认证头

          **格式**：`Bearer <your_access_token>`

          **令牌结构**：`base64(client_id).uuid.expires_at.signature`

          **完整示例**：
          ```
          Authorization: Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a
          ```
        default: "Bearer "
        example: "Bearer ZGVmYXVsdF9jbGllbnQ.62b7e497-4122-42ec-9e85-e157e4cf4574.1766390316.c519c5e0cdb6f5a786b31e83c8444ee7f064d284bbf4009b835163decfffa11a"
      - in: body
        name: body
        required: true
        schema:
          id: BatchOcrRequest
          required:
            - urls
          properties:
            urls:
              type: array
              maxItems: 10
              items:
                type: string
                format: uri
              example: ["https://tesseract.projectnaptha.com/img/eng_bw.png", "https://example.com/image2.jpg"]
              description: 待识别图片的URL数组
            language:
              type: string
              default: "eng"
              example: "chi_sim"
              description: 识别语言代码
    responses:
      200:
        description: 批量处理完成
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            message:
              type: string
              example: "批量处理完成，成功 8/10"
            data:
              type: object
              properties:
                total:
                  type: integer
                  example: 10
                successful:
                  type: integer
                  example: 8
                failed:
                  type: integer
                  example: 2
                results:
                  type: array
                  items:
                    type: object
                    properties:
                      url:
                        type: string
                      success:
                        type: boolean
                      text:
                        type: string
                        nullable: true
                      character_count:
                        type: integer
                        nullable: true
                      word_count:
                        type: integer
                        nullable: true
                      error:
                        type: string
                        nullable: true
            client_id:
              type: string
              example: "default_client"
      400:
        description: |
          - 缺少urls参数
          - urls不是数组
          - urls超过10个
      401:
        description: 认证失败
      500:
        description: 服务器内部错误
    """
    try:
        data = request.get_json()

        if not data or 'urls' not in data:
            return json_response(
                success=False,
                error="缺少参数",
                message="需要urls数组参数",
                status_code=400,
                client_id=getattr(request, 'client_id', 'unknown')
            )

        urls = data['urls']
        if not isinstance(urls, list) or len(urls) > 10:
            return json_response(
                success=False,
                error="参数错误",
                message="urls必须为数组且最多10个URL",
                status_code=400,
                client_id=getattr(request, 'client_id', 'unknown')
            )

        lang = data.get('language', 'eng')
        results = []

        for url in urls:
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }

                response = requests.get(url, headers=headers, timeout=10)
                response.raise_for_status()

                image_data = io.BytesIO(response.content)
                image = Image.open(image_data)

                text = pytesseract.image_to_string(image, lang=lang)

                results.append({
                    'url': url,
                    'success': True,
                    'text': text.strip(),
                    'character_count': len(text.strip()),
                    'word_count': len(text.strip().split())
                })
            except Exception as e:
                results.append({
                    'url': url,
                    'success': False,
                    'error': str(e)
                })

        successful = len([r for r in results if r['success']])

        return json_response(
            success=True,
            message=f"批量处理完成，成功 {successful}/{len(urls)}",
            data={
                'total': len(urls),
                'successful': successful,
                'failed': len(urls) - successful,
                'results': results
            },
            client_id=getattr(request, 'client_id', 'unknown')
        )

    except Exception as e:
        logger.error(f"批量OCR处理错误: {str(e)}")
        return json_response(
            success=False,
            error="批量处理失败",
            message=str(e),
            status_code=500,
            client_id=getattr(request, 'client_id', 'unknown')
        )

# 首页
@app.route('/', methods=['GET'])
def index():
    """
    服务首页和API概览
    ---
    tags:
      - 服务信息
    summary: 获取服务信息和API端点列表
    description: |
      返回OCR API服务的基本信息和所有可用的API端点，无需认证。

      **包含信息**：
      - 服务版本
      - 认证状态
      - 所有API端点路径、方法和认证要求
    responses:
      200:
        description: 服务信息获取成功
        schema:
          type: object
          properties:
            success:
              type: boolean
              example: true
            message:
              type: string
              example: "OCR API 服务"
            data:
              type: object
              properties:
                service:
                  type: string
                  example: "OCR API"
                version:
                  type: string
                  example: "1.0.0"
                authentication_required:
                  type: boolean
                  example: true
                endpoints:
                  type: object
                  additionalProperties:
                    type: object
                    properties:
                      path:
                        type: string
                      method:
                        type: string
                      auth:
                        type: boolean
                authentication:
                  type: object
                  properties:
                    method:
                      type: string
                      example: "client_id / client_secret"
                    token_type:
                      type: string
                      example: "Bearer Token"
    """
    return json_response(
        success=True,
        message="OCR API 服务",
        data={
            'service': 'OCR API',
            'version': '1.0.0',
            'authentication_required': app.config['AUTH_ENABLED'],
            'endpoints': {
                'health': {'path': '/api/v1/health', 'method': 'GET', 'auth': False},
                'get_token': {'path': '/api/v1/auth/token', 'method': 'POST', 'auth': False},
                'languages': {'path': '/api/v1/languages', 'method': 'GET', 'auth': True},
                'test_ocr': {'path': '/api/v1/test/ocr', 'method': 'POST', 'auth': False},
                'ocr': {'path': '/api/v1/ocr/url', 'method': 'POST', 'auth': True},
                'batch_ocr': {'path': '/api/v1/ocr/batch', 'method': 'POST', 'auth': True}
            },
            'authentication': {
                'method': 'client_id / client_secret',
                'token_type': 'Bearer Token'
            }
        }
    )

# 错误处理器
@app.errorhandler(404)
def not_found(error):
    return json_response(
        success=False,
        error="API端点不存在",
        message="请检查请求路径",
        status_code=404
    )

@app.errorhandler(405)
def method_not_allowed(error):
    return json_response(
        success=False,
        error="请求方法不允许",
        message="请检查HTTP方法",
        status_code=405
    )

if __name__ == '__main__':
    # 启动信息
    logger.info("=" * 50)
    logger.info("OCR API 服务启动")
    logger.info("=" * 50)

    logger.info(f"认证状态: {'启用' if app.config['AUTH_ENABLED'] else '禁用'}")
    logger.info(f"Tesseract版本: {get_tesseract_version_str()}")
    logger.info(f"客户端数量: {len(client_store.clients)}")

    default_client = client_store.get_client_info("default_client")
    if default_client:
        logger.info(f"默认客户端: default_client")

    logger.info("")
    logger.info("API端点:")
    logger.info("  GET  /              - 首页")
    logger.info("  GET  /api/v1/health - 健康检查")
    logger.info("  POST /api/v1/auth/token - 获取令牌")
    logger.info("  GET  /api/v1/languages - 语言列表（需认证）")
    logger.info("  POST /api/v1/test/ocr - 测试OCR（无需认证）")
    logger.info("  POST /api/v1/ocr/url - OCR识别（需认证）")
    logger.info("  POST /api/v1/ocr/batch - 批量OCR（需认证）")
    logger.info("")
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    logger.info(f"API文档地址: http://{host}:{port}/docs/")
    logger.info(f"OpenAPI规范文件: http://{host}:{port}/api/v1/apispec.json")
    logger.info(f"服务器地址: http://{host}:{port}")
    logger.info(f"调试模式: {debug}")
    app.run(host=host, port=port, debug=debug, threaded=True)
