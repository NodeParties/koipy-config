# 请先安装aiohttp
# pip install -U aiohttp
import json
import sqlite3
from datetime import datetime
from pathlib import Path
import hashlib
import secrets

from aiohttp import web
from PIL import Image, ImageDraw
import io
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 默认密码，实际使用中应该从配置文件或环境变量中读取
DEFAULT_PASSWORD = "koipy123"
SESSIONS = set()  # 存储有效的会话令牌


def init_callback_db():
    """初始化回调数据库"""
    conn = sqlite3.connect('callback_data.db', check_same_thread=False)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS callback_logs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT,
                  data TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS result_logs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT,
                  data TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS on_message_logs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT,
                  data TEXT)''')

    # 创建黑名单表，支持用户名和用户ID
    c.execute('''CREATE TABLE IF NOT EXISTS blacklist
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  userid INTEGER UNIQUE,
                  added_at TEXT)''')
    # 创建用户名黑名单表
    c.execute('''CREATE TABLE IF NOT EXISTS username_blacklist
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  added_by TEXT,
                  added_at TEXT,
                  reason TEXT)''')

    # 创建用户ID黑名单表
    c.execute('''CREATE TABLE IF NOT EXISTS userid_blacklist
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  userid INTEGER UNIQUE,
                  added_by TEXT,
                  added_at TEXT,
                  reason TEXT)''')
    conn.commit()
    return conn


# 初始化数据库连接
db_conn = init_callback_db()


# 初始化黑名单数据库连接
def init_blacklist_db():
    """初始化黑名单数据库"""
    db_path = Path('blacklist.db')
    if db_path.exists():
        # 如果独立的黑名单数据库存在，则使用它
        conn = sqlite3.connect(db_path, check_same_thread=False)
    else:
        # 否则使用回调数据库
        conn = db_conn
    return conn


# 黑名单数据库连接
blacklist_db_conn = init_blacklist_db()


def generate_token():
    """生成随机令牌"""
    return secrets.token_urlsafe(32)


def hash_password(password):
    """哈希密码"""
    return hashlib.sha256(password.encode()).hexdigest()


def check_auth(request):
    """检查用户是否已认证"""
    token = request.cookies.get('auth_token')
    return token in SESSIONS


def require_auth(handler):
    """装饰器：为需要认证的路由添加认证检查"""

    async def wrapper(request):
        if not check_auth(request):
            return web.json_response({'error': 'Unauthorized'}, status=401)
        return await handler(request)

    return wrapper


async def login(request):
    """登录接口"""
    try:
        data = await request.json()
        password = data.get('password', '')

        if hash_password(password) == hash_password(DEFAULT_PASSWORD):
            token = generate_token()
            SESSIONS.add(token)
            response = web.json_response({'success': True, 'token': token})
            response.set_cookie('auth_token', token, max_age=3600, httponly=True)
            return response
        else:
            return web.json_response({'success': False, 'error': 'Invalid password'}, status=401)
    except Exception as e:
        return web.json_response({'success': False, 'error': str(e)}, status=500)


async def logout(request):
    """登出接口"""
    token = request.cookies.get('auth_token')
    if token:
        # 从会话集合中移除令牌
        SESSIONS.discard(token)

    # 创建响应
    response = web.json_response(
        {'success': True, 'message': '成功登出'},
        status=200
    )

    # 删除认证cookie，并设置安全属性
    response.del_cookie('auth_token', secure=True, httponly=True)

    # 添加CORS头部
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Credentials'] = 'true'

    return response


async def check_auth_status(request):
    """检查认证状态接口"""
    if check_auth(request):
        return web.json_response({'authenticated': True})
    else:
        return web.json_response({'authenticated': False}, status=401)


async def generate_test_image(text: str = "Test Image") -> bytes:
    """生成一个简单的测试图片"""
    # 创建一个300x200的白色背景图片
    width = 300
    height = 200
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)

    # 绘制一些文本和图形
    draw.rectangle([10, 10, width - 10, height - 10], outline='blue', width=2)
    draw.text((width // 2 - 50, height // 2), text, fill='black')

    # 添加时间戳
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    draw.text((10, height - 20), timestamp, fill='gray')

    # 转换为JPEG字节流
    img_byte_arr = io.BytesIO()
    image.save(img_byte_arr, format='png')
    img_byte_arr = img_byte_arr.getvalue()

    return img_byte_arr


class ImageServer:
    @staticmethod
    async def handle_image(request: web.Request) -> web.Response:
        """处理图片请求并返回JPEG图片"""
        try:
            # 从请求中获取文本参数
            data = await request.json()
            text = data.get('text', 'Test Image')

            # 生成图片
            image_data = await generate_test_image(text)

            # 设置响应头
            headers = {
                'Content-Type': 'image/jpeg',
                'Content-Disposition': 'attachment; filename="test.jpg"'
            }

            logger.info(f"Generating image with text: {text}")

            return web.Response(body=image_data, headers=headers, status=200)

        except Exception as e:
            logger.error(f"Error generating image: {e}")
            return web.Response(
                status=500,
                text=f"Error generating image: {str(e)}"
            )


def blacklist_handler(data):
    try:
        # 解析JSON数据
        json_data = json.loads(data)
        message = json_data.get('message', {})

        # 检查用户是否在黑名单中
        # 支持正常账户和匿名账户
        user_id = None
        username = None

        # 正常账户
        if 'from-user' in message:
            user_id = message['from-user']['id']
            username = message['from-user']['username']

        # 匿名账户 (sender-chat)
        elif 'sender-chat' in message:
            sender_chat = message['sender-chat']
            user_id = sender_chat.get('id')

        # 检查用户ID是否在黑名单中
        if user_id:
            c = blacklist_db_conn.cursor()
            c.execute("SELECT * FROM userid_blacklist WHERE userid = ?", (user_id,))
            result = c.fetchone()

            if result:
                reason = result[-1]
                return web.Response(status=403, text=f'你已被拉黑！\n原因:  {reason}')

        # 检查用户名是否在黑名单中 (仅适用于正常账户)
        if username:
            c = blacklist_db_conn.cursor()
            c.execute("SELECT * FROM username_blacklist WHERE username = ?", (username,))
            result = c.fetchone()

            if result:
                reason = result[-1]
                return web.Response(status=403, text=f'你已被拉黑！\n原因:  {reason}')

    except KeyError:
        # 如果消息结构中没有相关字段，继续处理
        pass
    except Exception as e:
        logger.error(f"Error checking blacklist: {e}")


async def on_message(request: web.Request):
    # Get the JSON data from request
    data = await request.text()
    print(data)
    # data = json.loads(data)
    # Return the data as-is

    try:
        c = db_conn.cursor()
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        c.execute("INSERT INTO on_message_logs (timestamp, data) VALUES (?, ?)",
                  (timestamp, data))
        db_conn.commit()
        logger.info(f"Data saved to database with timestamp: {timestamp}")
    except Exception as e:
        logger.error(f"Error saving data to database: {e}")
    resp = blacklist_handler(data)
    if isinstance(resp, web.Response):
        return resp
    return web.json_response()


async def on_pre_send(request):
    data = await request.text()
    print(data)
    data = json.loads(data)

    # 保存数据到sqlite数据库
    try:
        c = db_conn.cursor()
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        c.execute("INSERT INTO callback_logs (timestamp, data) VALUES (?, ?)",
                  (timestamp, json.dumps(data, ensure_ascii=False)))
        db_conn.commit()
        logger.info(f"Data saved to database with timestamp: {timestamp}")
    except Exception as e:
        logger.error(f"Error saving data to database: {e}")
    return web.Response(status=200)
    # return await ImageServer.handle_image(request)


async def on_result(request):
    data = await request.json()
    result: dict = data['result']
    # result["NewKey"] = ["回调新增数据1" for _ in range(len(result["节点名称"]))]
    data['result'] = result

    # 保存结果数据到sqlite数据库
    try:
        c = db_conn.cursor()
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        c.execute("INSERT INTO result_logs (timestamp, data) VALUES (?, ?)",
                  (timestamp, json.dumps(data, ensure_ascii=False)))
        db_conn.commit()
        logger.info(f"Result data saved to database with timestamp: {timestamp}")
    except Exception as e:
        logger.error(f"Error saving result data to database: {e}")

    return web.json_response(data)


# 黑名单管理API
async def get_username_blacklist(request):
    """获取用户名黑名单列表"""
    if not check_auth(request):
        return web.json_response({'error': 'Unauthorized'}, status=401)

    try:
        c = blacklist_db_conn.cursor()
        c.execute("SELECT username, added_by, added_at, reason FROM username_blacklist ORDER BY added_at DESC")
        rows = c.fetchall()

        blacklist = []
        for row in rows:
            blacklist.append({
                'username': row[0],
                'added_by': row[1],
                'added_at': row[2],
                'reason': row[3]
            })

        return web.json_response(blacklist)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)


async def get_userid_blacklist(request):
    """获取用户ID黑名单列表"""
    if not check_auth(request):
        return web.json_response({'error': 'Unauthorized'}, status=401)

    try:
        c = blacklist_db_conn.cursor()
        c.execute("SELECT userid, added_by, added_at, reason FROM userid_blacklist ORDER BY added_at DESC")
        rows = c.fetchall()

        blacklist = []
        for row in rows:
            blacklist.append({
                'userid': row[0],
                'added_by': row[1],
                'added_at': row[2],
                'reason': row[3]
            })

        return web.json_response(blacklist)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)


async def add_username_to_blacklist(request):
    """添加用户名到黑名单"""
    if not check_auth(request):
        return web.json_response({'error': 'Unauthorized'}, status=401)

    try:
        data = await request.json()
        username = data.get('username')
        reason = data.get('reason', '')
        added_by = 'admin'  # 在实际应用中，这应该是当前登录用户

        if not username:
            return web.json_response({'success': False, 'error': '用户名不能为空'}, status=400)

        c = blacklist_db_conn.cursor()
        try:
            c.execute(
                "INSERT INTO username_blacklist (username, added_by, added_at, reason) VALUES (?, ?, ?, ?)",
                (username, added_by, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), reason)
            )
            blacklist_db_conn.commit()
            logger.info(f"Added username {username} to blacklist")
            return web.json_response({'success': True})
        except sqlite3.IntegrityError:
            return web.json_response({'success': False, 'error': '用户名已在黑名单中'}, status=400)
    except Exception as e:
        logger.error(f"Error adding username to blacklist: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)


async def add_userid_to_blacklist(request):
    """添加用户ID到黑名单"""
    if not check_auth(request):
        return web.json_response({'error': 'Unauthorized'}, status=401)

    try:
        data = await request.json()
        userid = data.get('userid')
        reason = data.get('reason', '')
        added_by = 'admin'  # 在实际应用中，这应该是当前登录用户

        if not userid:
            return web.json_response({'success': False, 'error': '用户ID不能为空'}, status=400)

        try:
            userid = int(userid)
        except ValueError:
            return web.json_response({'success': False, 'error': '用户ID必须是数字'}, status=400)

        c = blacklist_db_conn.cursor()
        try:
            c.execute(
                "INSERT INTO userid_blacklist (userid, added_by, added_at, reason) VALUES (?, ?, ?, ?)",
                (userid, added_by, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), reason)
            )
            blacklist_db_conn.commit()
            logger.info(f"Added userid {userid} to blacklist")
            return web.json_response({'success': True})
        except sqlite3.IntegrityError:
            return web.json_response({'success': False, 'error': '用户ID已在黑名单中'}, status=400)
    except Exception as e:
        logger.error(f"Error adding userid to blacklist: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)


async def remove_username_from_blacklist(request):
    """从黑名单中移除用户名"""
    if not check_auth(request):
        return web.json_response({'error': 'Unauthorized'}, status=401)

    try:
        username = request.match_info['username']

        c = blacklist_db_conn.cursor()
        c.execute("DELETE FROM username_blacklist WHERE username = ?", (username,))
        blacklist_db_conn.commit()

        if c.rowcount > 0:
            logger.info(f"Removed username {username} from blacklist")
            return web.json_response({'success': True})
        else:
            return web.json_response({'success': False, 'error': '用户名不在黑名单中'}, status=404)
    except Exception as e:
        logger.error(f"Error removing username from blacklist: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)


async def remove_userid_from_blacklist(request):
    """从黑名单中移除用户ID"""
    if not check_auth(request):
        return web.json_response({'error': 'Unauthorized'}, status=401)

    try:
        userid = request.match_info['userid']
        try:
            userid = int(userid)
        except ValueError:
            return web.json_response({'success': False, 'error': '无效的用户ID'}, status=400)

        c = blacklist_db_conn.cursor()
        c.execute("DELETE FROM userid_blacklist WHERE userid = ?", (userid,))
        blacklist_db_conn.commit()

        if c.rowcount > 0:
            logger.info(f"Removed userid {userid} from blacklist")
            return web.json_response({'success': True})
        else:
            return web.json_response({'success': False, 'error': '用户ID不在黑名单中'}, status=404)
    except Exception as e:
        logger.error(f"Error removing userid from blacklist: {e}")
        return web.json_response({'success': False, 'error': str(e)}, status=500)


async def index(request):
    """处理首页请求"""
    # 检查是否已认证
    if not check_auth(request):
        # 返回登录页面
        response = web.FileResponse("login.html")
        # 添加缓存控制头部，防止页面被缓存
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    response = web.FileResponse("./blacklist_frontend.html")
    # 添加缓存控制头部，防止页面被缓存
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


async def init_app():
    _app = web.Application()
    # Setup routes
    _app.router.add_get('/', index)
    _app.router.add_get('/index', index)  # 保留原来的/index路由以兼容性
    _app.router.add_post('/api/login', login)
    _app.router.add_post('/api/logout', logout)
    _app.router.add_get('/api/auth/check', check_auth_status)  # 添加认证检查路由
    _app.router.add_post('/onMessage', on_message)
    _app.router.add_post('/onPreSend', on_pre_send)
    _app.router.add_post('/onResult', on_result)
    # API路由
    _app.router.add_get('/api/blacklist/username', get_username_blacklist)
    _app.router.add_post('/api/blacklist/username', add_username_to_blacklist)
    _app.router.add_delete('/api/blacklist/username/{username}', remove_username_from_blacklist)

    _app.router.add_get('/api/blacklist/userid', get_userid_blacklist)
    _app.router.add_post('/api/blacklist/userid', add_userid_to_blacklist)
    _app.router.add_delete('/api/blacklist/userid/{userid}', remove_userid_from_blacklist)
    return _app


if __name__ == '__main__':
    app = init_app()
    web.run_app(app, host='0.0.0.0', port=8080)
