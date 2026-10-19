from flask import Flask, render_template, request, jsonify, Response
import sqlite3, os, hmac
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "pedidos.db")
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
PORT = int(os.environ.get("PORT", "5000"))

class PgCursor:
    def __init__(self, cursor): self.cursor = cursor
    def fetchone(self): return self.cursor.fetchone()
    def fetchall(self): return self.cursor.fetchall()
    @property
    def rowcount(self): return self.cursor.rowcount

class PgConnection:
    def __init__(self, conn): self.conn = conn
    def execute(self, sql, params=()):
        sql = sql.replace("?", "%s")
        cur = self.conn.cursor()
        cur.execute(sql, params)
        return PgCursor(cur)
    def executemany(self, sql, seq):
        sql = sql.replace("?", "%s")
        cur = self.conn.cursor()
        cur.executemany(sql, seq)
        return PgCursor(cur)
    def __enter__(self): return self
    def __exit__(self, typ, value, tb):
        if typ is None: self.conn.commit()
        else: self.conn.rollback()
        self.conn.close()
        return False

def db():
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, sslmode="require", connect_timeout=10)
        return PgConnection(conn)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

PROTECTED_PATHS = {"/admin"}
@app.before_request
def protect_admin():
    path, method = request.path, request.method
    protected = (
        path in PROTECTED_PATHS
        or (path == "/api/orders" and method in ("GET", "PATCH"))
        or (path.startswith("/api/products/") and method in ("PATCH", "PUT", "DELETE"))
        or (path == "/api/products" and method == "POST")
        or path.startswith("/api/categories")
        or path.startswith("/api/settings")
    )
    if not protected:
        return None
    expected_user = os.environ.get("ADMIN_USER", "").strip()
    expected_password = os.environ.get("ADMIN_PASSWORD", "")
    if not expected_user or not expected_password:
        return Response("Panel administrativo no configurado. Definí ADMIN_USER y ADMIN_PASSWORD en el servicio.", status=503, mimetype="text/plain")
    auth = request.authorization
    if not auth or not hmac.compare_digest(auth.username or "", expected_user) or not hmac.compare_digest(auth.password or "", expected_password):
        return Response("Se requiere iniciar sesión", 401, {"WWW-Authenticate": 'Basic realm="Panel de pedidos"'})
    return None

DEFAULT_PRODUCTS = [
    ("Bebidas", "Agua sin gas", 80), ("Bebidas", "Agua con gas", 90),
    ("Bebidas", "Refresco", 120), ("Bebidas", "Cerveza", 180),
    ("Comida", "Hamburguesa", 320), ("Comida", "Papas fritas", 180),
    ("Comida", "Pizza", 350), ("Postres", "Brownie", 160),
]

def init_db():
    with db() as c:
        if DATABASE_URL:
            c.execute("""CREATE TABLE IF NOT EXISTS products (
                id BIGSERIAL PRIMARY KEY, category TEXT NOT NULL,
                name TEXT NOT NULL, price DOUBLE PRECISION NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)""")
            c.execute("""CREATE TABLE IF NOT EXISTS orders (
                id BIGSERIAL PRIMARY KEY, customer TEXT NOT NULL,
                notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Recibido', created_at TEXT NOT NULL)""")
            c.execute("""CREATE TABLE IF NOT EXISTS order_items (
                id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL,
                product_id BIGINT, name TEXT NOT NULL, price DOUBLE PRECISION NOT NULL,
                quantity INTEGER NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE)""")
            c.execute("CREATE TABLE IF NOT EXISTS categories (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
            c.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        else:
            c.execute("""CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL,
                name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)""")
            c.execute("""CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT NOT NULL,
                notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Recibido', created_at TEXT NOT NULL)""")
            c.execute("""CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL,
                product_id INTEGER, name TEXT NOT NULL, price REAL NOT NULL,
                quantity INTEGER NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE)""")
            c.execute("CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)")
            c.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        count = c.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"]
        if count == 0:
            c.executemany("INSERT INTO products(category,name,price) VALUES(?,?,?)", DEFAULT_PRODUCTS)
        existing = c.execute("SELECT DISTINCT category FROM products WHERE TRIM(category) <> ''").fetchall()
        for row in existing:
            cat = str(row["category"]).strip()
            if DATABASE_URL:
                c.execute("INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING", (cat,))
            else:
                c.execute("INSERT OR IGNORE INTO categories(name) VALUES(?)", (cat,))
        defaults = {"business_name": "Mi negocio", "currency_symbol": "$"}
        for key, value in defaults.items():
            if DATABASE_URL:
                c.execute("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING", (key, value))
            else:
                c.execute("INSERT OR IGNORE INTO app_settings(key,value) VALUES(?,?)", (key, value))

def money(n): return round(float(n), 2)

def get_settings():
    with db() as c:
        rows = c.execute("SELECT key,value FROM app_settings").fetchall()
    result = {r["key"]: r["value"] for r in rows}
    result.setdefault("business_name", "Mi negocio")
    result.setdefault("currency_symbol", "$")
    return result

@app.route("/")
def index(): return render_template("index.html", settings=get_settings())

@app.route("/admin")
def admin(): return render_template("admin.html", settings=get_settings())

@app.get("/api/products")
def products():
    with db() as c:
        rows = c.execute("SELECT id,category,name,price FROM products WHERE active=1 ORDER BY category,name").fetchall()
    return jsonify([dict(r) for r in rows])

@app.post("/api/orders")
def create_order():
    data = request.get_json(silent=True) or {}
    customer = str(data.get("customer", "")).strip()
    items = data.get("items", [])
    notes = str(data.get("notes", "")).strip()[:500]
    if not customer: return jsonify(error="Ingresá el nombre del cliente."), 400
    if not isinstance(items, list) or not items: return jsonify(error="Agregá al menos un producto."), 400
    with db() as c:
        valid = []
        for item in items:
            try: pid, qty = int(item.get("product_id")), int(item.get("quantity"))
            except (ValueError, TypeError, AttributeError): continue
            if qty < 1 or qty > 99: continue
            p = c.execute("SELECT id,name,price FROM products WHERE id=? AND active=1", (pid,)).fetchone()
            if p: valid.append((p["id"], p["name"], money(p["price"]), qty))
        if not valid: return jsonify(error="No hay productos válidos en el pedido."), 400
        now = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")
        cur = c.execute("INSERT INTO orders(customer,notes,status,created_at) VALUES(?,?,?,?) RETURNING id", (customer, notes, "Recibido", now))
        oid = cur.fetchone()["id"]
        c.executemany("INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)", [(oid, *x) for x in valid])
    return jsonify(ok=True, order_id=oid)

@app.get("/api/orders")
def get_orders():
    with db() as c:
        orders = c.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 200").fetchall()
        result = []
        for o in orders:
            items = c.execute("SELECT name,price,quantity FROM order_items WHERE order_id=? ORDER BY id", (o["id"],)).fetchall()
            total = sum(i["price"] * i["quantity"] for i in items)
            result.append({**dict(o), "items": [dict(i) for i in items], "total": money(total)})
    return jsonify(result)

@app.patch("/api/orders/<int:oid>")
def update_order(oid):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in ["Recibido", "En preparación", "Listo", "Entregado", "Cancelado"]: return jsonify(error="Estado no válido."), 400
    with db() as c:
        cur = c.execute("UPDATE orders SET status=? WHERE id=?", (status, oid))
        if cur.rowcount == 0: return jsonify(error="Pedido no encontrado."), 404
    return jsonify(ok=True)

@app.get("/api/categories")
def get_categories():
    with db() as c:
        rows = c.execute("SELECT id,name FROM categories ORDER BY name").fetchall()
    return jsonify([dict(r) for r in rows])

@app.post("/api/categories")
def add_category():
    name = str((request.get_json(silent=True) or {}).get("name", "")).strip()[:60]
    if not name: return jsonify(error="Escribí un nombre para la categoría."), 400
    try:
        with db() as c:
            cur = c.execute("INSERT INTO categories(name) VALUES(?) RETURNING id", (name,))
            cid = cur.fetchone()["id"]
        return jsonify(ok=True, id=cid, name=name)
    except Exception:
        return jsonify(error="Esa categoría ya existe o no se pudo guardar."), 409

@app.patch("/api/categories/<int:cid>")
def edit_category(cid):
    name = str((request.get_json(silent=True) or {}).get("name", "")).strip()[:60]
    if not name: return jsonify(error="Escribí un nombre para la categoría."), 400
    try:
        with db() as c:
            old = c.execute("SELECT name FROM categories WHERE id=?", (cid,)).fetchone()
            if not old: return jsonify(error="Categoría no encontrada."), 404
            c.execute("UPDATE products SET category=? WHERE category=?", (name, old["name"]))
            c.execute("UPDATE categories SET name=? WHERE id=?", (name, cid))
        return jsonify(ok=True)
    except Exception:
        return jsonify(error="Ese nombre ya existe o no se pudo guardar."), 409

@app.delete("/api/categories/<int:cid>")
def delete_category(cid):
    with db() as c:
        cat = c.execute("SELECT name FROM categories WHERE id=?", (cid,)).fetchone()
        if not cat: return jsonify(error="Categoría no encontrada."), 404
        used = c.execute("SELECT COUNT(*) AS n FROM products WHERE category=? AND active=1", (cat["name"],)).fetchone()["n"]
        if used: return jsonify(error="No podés eliminar una categoría que tiene productos activos. Cambiá esos productos de categoría primero."), 400
        c.execute("DELETE FROM categories WHERE id=?", (cid,))
    return jsonify(ok=True)

@app.post("/api/products")
def add_product():
    data = request.get_json(silent=True) or {}
    category = str(data.get("category", "")).strip()[:60]
    name = str(data.get("name", "")).strip()[:100]
    try: price = float(data.get("price"))
    except (ValueError, TypeError): price = -1
    if not category or not name or price < 0 or price > 1000000: return jsonify(error="Completá categoría, producto y precio válido."), 400
    with db() as c:
        exists = c.execute("SELECT id FROM categories WHERE name=?", (category,)).fetchone()
        if not exists:
            if DATABASE_URL: c.execute("INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING", (category,))
            else: c.execute("INSERT OR IGNORE INTO categories(name) VALUES(?)", (category,))
        cur = c.execute("INSERT INTO products(category,name,price) VALUES(?,?,?) RETURNING id", (category, name, money(price)))
        pid = cur.fetchone()["id"]
    return jsonify(ok=True, id=pid)

@app.patch("/api/products/<int:pid>")
def edit_product(pid):
    data = request.get_json(silent=True) or {}
    category = str(data.get("category", "")).strip()[:60]
    name = str(data.get("name", "")).strip()[:100]
    try: price = float(data.get("price"))
    except (ValueError, TypeError): price = -1
    if not category or not name or price < 0 or price > 1000000: return jsonify(error="Completá categoría, nombre y precio válido."), 400
    with db() as c:
        exists = c.execute("SELECT id FROM products WHERE id=? AND active=1", (pid,)).fetchone()
        if not exists: return jsonify(error="Producto no encontrado."), 404
        cat = c.execute("SELECT id FROM categories WHERE name=?", (category,)).fetchone()
        if not cat:
            if DATABASE_URL: c.execute("INSERT INTO categories(name) VALUES(?) ON CONFLICT(name) DO NOTHING", (category,))
            else: c.execute("INSERT OR IGNORE INTO categories(name) VALUES(?)", (category,))
        c.execute("UPDATE products SET category=?,name=?,price=? WHERE id=?", (category, name, money(price), pid))
    return jsonify(ok=True)

@app.delete("/api/products/<int:pid>")
def delete_product(pid):
    with db() as c:
        cur = c.execute("UPDATE products SET active=0 WHERE id=? AND active=1", (pid,))
        if cur.rowcount == 0: return jsonify(error="Producto no encontrado."), 404
    return jsonify(ok=True)

@app.get("/api/settings")
def api_get_settings(): return jsonify(get_settings())

@app.patch("/api/settings")
def api_update_settings():
    data = request.get_json(silent=True) or {}
    business_name = str(data.get("business_name", "")).strip()[:80]
    currency_symbol = str(data.get("currency_symbol", "$" )).strip()[:4] or "$"
    if not business_name: return jsonify(error="El nombre del negocio no puede quedar vacío."), 400
    with db() as c:
        for key, value in (("business_name", business_name), ("currency_symbol", currency_symbol)):
            if DATABASE_URL:
                c.execute("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value", (key, value))
            else:
                c.execute("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
    return jsonify(ok=True)

@app.get("/health")
def health(): return jsonify(ok=True)

init_db()

if __name__ == "__main__": app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
