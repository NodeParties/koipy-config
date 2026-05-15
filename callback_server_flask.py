import json
import sqlite3
from datetime import datetime
from pathlib import Path
import hashlib
import secrets
from flask import Flask, request, jsonify, make_response, send_file
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 默认密码，实际使用中应该从配置文件或环境变量中读取
DEFAULT_PASSWORD = "koipy123"
SESSIONS = set()  # 存储有效的会话令牌

app = Flask(__name__)


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


def check_auth():
    """检查用户是否已认证"""
    token = request.cookies.get('auth_token')
    return token in SESSIONS


# 登录页面路由
@app.route('/')
@app.route('/index')
def index():
    """处理首页请求"""
    # 检查是否已认证
    if not check_auth():
        # 返回登录页面
        return send_file("login.html")
    return send_file("./index.html")


@app.route('/api/login', methods=['POST'])
def login():
    """登录接口"""
    try:
        data = request.get_json()
        password = data.get('password', '')

        if hash_password(password) == hash_password(DEFAULT_PASSWORD):
            token = generate_token()
            SESSIONS.add(token)
            response = make_response(jsonify({'success': True, 'token': token}))
            response.set_cookie('auth_token', token, max_age=3600, httponly=True, secure=True)
            return response
        else:
            return jsonify({'success': False, 'error': 'Invalid password'}), 401
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    """登出接口"""
    token = request.cookies.get('auth_token')
    if token:
        # 从会话集合中移除令牌
        SESSIONS.discard(token)

    # 创建响应
    response = make_response(jsonify({'success': True, 'message': '成功登出'}))

    # 删除认证cookie，并设置安全属性
    response.set_cookie('auth_token', '', expires=0, secure=True, httponly=True)

    return response


@app.route('/api/auth/check', methods=['GET'])
def check_auth_status():
    """检查认证状态接口"""
    if check_auth():
        return jsonify({'authenticated': True})
    else:
        return jsonify({'authenticated': False}), 401


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
                return make_response(f'你已被拉黑！\n原因:  {reason}', 403)

        # 检查用户名是否在黑名单中 (仅适用于正常账户)
        if username:
            c = blacklist_db_conn.cursor()
            c.execute("SELECT * FROM username_blacklist WHERE username = ?", (username,))
            result = c.fetchone()

            if result:
                reason = result[-1]
                return make_response(f'你已被拉黑！\n原因:  {reason}', 403)

    except KeyError:
        # 如果消息结构中没有相关字段，继续处理
        pass
    except Exception as e:
        logger.error(f"Error checking blacklist: {e}")


@app.route('/onMessage', methods=['POST'])
def on_message():
    # Get the JSON data from request
    data = request.get_data(as_text=True)
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
    if resp:
        return resp
    return jsonify({})


@app.route('/onPreSend', methods=['POST'])
def on_pre_send():
    data = request.get_data(as_text=True)
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
    return '', 200


@app.route('/onResult', methods=['POST'])
def on_result():
    data = request.get_json()
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

    return jsonify(data)


# 黑名单管理API
@app.route('/api/blacklist/username', methods=['GET'])
def get_username_blacklist():
    """获取用户名黑名单列表"""
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

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

        return jsonify(blacklist)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/blacklist/username', methods=['POST'])
def add_username_to_blacklist():
    """添加用户名到黑名单"""
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        username = data.get('username')
        reason = data.get('reason', '')
        added_by = 'admin'  # 在实际应用中，这应该是当前登录用户

        if not username:
            return jsonify({'success': False, 'error': '用户名不能为空'}), 400

        c = blacklist_db_conn.cursor()
        try:
            c.execute(
                "INSERT INTO username_blacklist (username, added_by, added_at, reason) VALUES (?, ?, ?, ?)",
                (username, added_by, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), reason)
            )
            blacklist_db_conn.commit()
            logger.info(f"Added username {username} to blacklist")
            return jsonify({'success': True})
        except sqlite3.IntegrityError:
            return jsonify({'success': False, 'error': '用户名已在黑名单中'}), 400
    except Exception as e:
        logger.error(f"Error adding username to blacklist: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/blacklist/username/<username>', methods=['DELETE'])
def remove_username_from_blacklist(username):
    """从黑名单中移除用户名"""
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        c = blacklist_db_conn.cursor()
        c.execute("DELETE FROM username_blacklist WHERE username = ?", (username,))
        blacklist_db_conn.commit()

        if c.rowcount > 0:
            logger.info(f"Removed username {username} from blacklist")
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': '用户名不在黑名单中'}), 404
    except Exception as e:
        logger.error(f"Error removing username from blacklist: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/blacklist/userid', methods=['GET'])
def get_userid_blacklist():
    """获取用户ID黑名单列表"""
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

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

        return jsonify(blacklist)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/blacklist/userid', methods=['POST'])
def add_userid_to_blacklist():
    """添加用户ID到黑名单"""
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        data = request.get_json()
        userid = data.get('userid')
        reason = data.get('reason', '')
        added_by = 'admin'  # 在实际应用中，这应该是当前登录用户

        if not userid:
            return jsonify({'success': False, 'error': '用户ID不能为空'}), 400

        try:
            userid = int(userid)
        except ValueError:
            return jsonify({'success': False, 'error': '用户ID必须是数字'}), 400

        c = blacklist_db_conn.cursor()
        try:
            c.execute(
                "INSERT INTO userid_blacklist (userid, added_by, added_at, reason) VALUES (?, ?, ?, ?)",
                (userid, added_by, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), reason)
            )
            blacklist_db_conn.commit()
            logger.info(f"Added userid {userid} to blacklist")
            return jsonify({'success': True})
        except sqlite3.IntegrityError:
            return jsonify({'success': False, 'error': '用户ID已在黑名单中'}), 400
    except Exception as e:
        logger.error(f"Error adding userid to blacklist: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/blacklist/userid/<int:userid>', methods=['DELETE'])
def remove_userid_from_blacklist(userid):
    """从黑名单中移除用户ID"""
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    try:
        c = blacklist_db_conn.cursor()
        c.execute("DELETE FROM userid_blacklist WHERE userid = ?", (userid,))
        blacklist_db_conn.commit()

        if c.rowcount > 0:
            logger.info(f"Removed userid {userid} from blacklist")
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': '用户ID不在黑名单中'}), 404
    except Exception as e:
        logger.error(f"Error removing userid from blacklist: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=False)
