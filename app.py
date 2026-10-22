
from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import os
import hmac
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "pedidos.db")
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False

PORT = int(os.environ.get("PORT", "5000"))


class PgCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    @property
    def rowcount(self):
        return self.cursor.rowcount


class PgConnection:
    def __init__(self, conn):
        self.conn = conn

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

    def __enter__(self):
        return self

    def __exit__(self, typ, value, tb):
        if typ is None:
            self.conn.commit()
        else:
            self.conn.rollback()
        self.conn.close()
        return False


def db():
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(
            DATABASE_URL,
            row_factory=dict_row,
            sslmode="require",
            connect_timeout=10
        )
        return PgConnection(conn)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# Proteger el panel y las operaciones administrativas.
@app.before_request
def protect_admin():
    path, method = request.path, request.method

    protected = (
        path == "/admin"
        or (path == "/api/orders" and method == "GET")
        or (path.startswith("/api/orders/") and method == "PATCH")
        or (path == "/api/products" and method == "POST")
        or (
            path.startswith("/api/products/")
            and method in ("PATCH", "PUT", "DELETE")
        )
        or (
            path == "/api/categories"
            and method in ("GET", "POST")
        )
    )

    if not protected:
        return None

    expected_user = os.environ.get("ADMIN_USER", "").strip()
    expected_password = os.environ.get("ADMIN_PASSWORD", "")

    if not expected_user or not expected_password:
        return Response(
            "Panel administrativo no configurado. "
            "Definí ADMIN_USER y ADMIN_PASSWORD en Render.",
            status=503,
            mimetype="text/plain"
        )

    auth = request.authorization

    if (
        not auth
        or not hmac.compare_digest(
            auth.username or "", expected_user
        )
        or not hmac.compare_digest(
            auth.password or "", expected_password
        )
    ):
        return Response(
            "Se requiere iniciar sesión",
            401,
            {"WWW-Authenticate": 'Basic realm="Panel de pedidos"'}
        )

    return None


DEFAULT_PRODUCTS = [
    ("Bebidas", "Agua sin gas", 80),
    ("Bebidas", "Agua con gas", 90),
    ("Bebidas", "Refresco", 120),
    ("Bebidas", "Cerveza", 180),
    ("Comida", "Hamburguesa", 320),
    ("Comida", "Papas fritas", 180),
    ("Comida", "Pizza", 350),
    ("Postres", "Brownie", 160),
]


def init_db():
    with db() as c:
        if DATABASE_URL:
            c.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id BIGSERIAL PRIMARY KEY,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price DOUBLE PRECISION NOT NULL DEFAULT 0,
                    active INTEGER NOT NULL DEFAULT 1
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id BIGSERIAL PRIMARY KEY,
                    customer TEXT NOT NULL,
                    notes TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'Recibido',
                    created_at TEXT NOT NULL
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS order_items (
                    id BIGSERIAL PRIMARY KEY,
                    order_id BIGINT NOT NULL,
                    product_id BIGINT,
                    name TEXT NOT NULL,
                    price DOUBLE PRECISION NOT NULL,
                    quantity INTEGER NOT NULL,
                    FOREIGN KEY(order_id)
                        REFERENCES orders(id) ON DELETE CASCADE
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS categories (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE
                )
            """)

        else:
            c.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price REAL NOT NULL DEFAULT 0,
                    active INTEGER NOT NULL DEFAULT 1
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer TEXT NOT NULL,
                    notes TEXT DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'Recibido',
                    created_at TEXT NOT NULL
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    product_id INTEGER,
                    name TEXT NOT NULL,
                    price REAL NOT NULL,
                    quantity INTEGER NOT NULL,
                    FOREIGN KEY(order_id)
                        REFERENCES orders(id) ON DELETE CASCADE
                )
            """)

            c.execute("""
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE
                )
            """)

        # Crear productos de ejemplo solamente si no hay ninguno.
        count = c.execute(
            "SELECT COUNT(*) AS n FROM products"
        ).fetchone()["n"]

        if count == 0:
            c.executemany(
                "INSERT INTO products(category, name, price) VALUES(?,?,?)",
                DEFAULT_PRODUCTS
            )

        # Registrar como proveedores los nombres que ya aparecen
        # en los productos existentes, sin borrar ni modificar productos.
        c.execute("""
            INSERT INTO categories(name)
            SELECT DISTINCT TRIM(category)
            FROM products
            WHERE TRIM(category) <> ''
            ON CONFLICT(name) DO NOTHING
        """)


def money(n):
    return round(float(n), 2)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


# Listar proveedores.
@app.get("/api/categories")
def get_categories():
    with db() as c:
        rows = c.execute(
            "SELECT id, name FROM categories ORDER BY name"
        ).fetchall()

    return jsonify([dict(r) for r in rows])


# Crear proveedor.
@app.post("/api/categories")
def add_category():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:60]

    if not name:
        return jsonify(
            error="Ingresá el nombre del proveedor."
        ), 400

    try:
        with db() as c:
            cur = c.execute(
                "INSERT INTO categories(name) VALUES(?) RETURNING id",
                (name,)
            )
            category_id = cur.fetchone()["id"]

        return jsonify(
            ok=True,
            id=category_id,
            name=name
        )

    except Exception:
        return jsonify(
            error="Ese proveedor ya existe o no se pudo guardar."
        ), 409


# Listar productos activos.
@app.get("/api/products")
def products():
    with db() as c:
        rows = c.execute("""
            SELECT id, category, name, price
            FROM products
            WHERE active = 1
            ORDER BY category, name
        """).fetchall()

    return jsonify([dict(r) for r in rows])


# Crear pedido.
@app.post("/api/orders")
def create_order():
    data = request.get_json(silent=True) or {}
    customer = str(data.get("customer", "")).strip()
    items = data.get("items", [])
    notes = str(data.get("notes", "")).strip()[:500]

    if not customer:
        return jsonify(error="Ingresá el nombre del cliente."), 400

    if not isinstance(items, list) or not items:
        return jsonify(error="Agregá al menos un producto."), 400

    with db() as c:
        valid = []

        for item in items:
            try:
                pid = int(item.get("product_id"))
                qty = int(item.get("quantity"))
            except (ValueError, TypeError, AttributeError):
                continue

            if qty < 1 or qty > 99:
                continue

            p = c.execute("""
                SELECT id, name, price
                FROM products
                WHERE id = ? AND active = 1
            """, (pid,)).fetchone()

            if p:
                valid.append((
                    p["id"],
                    p["name"],
                    money(p["price"]),
                    qty
                ))

        if not valid:
            return jsonify(
                error="No hay productos válidos en el pedido."
            ), 400

        now = datetime.now().astimezone().strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        cur = c.execute("""
            INSERT INTO orders(customer, notes, status, created_at)
            VALUES(?,?,?,?)
            RETURNING id
        """, (customer, notes, "Recibido", now))

        oid = cur.fetchone()["id"]

        c.executemany("""
            INSERT INTO order_items(
                order_id, product_id, name, price, quantity
            )
            VALUES(?,?,?,?,?)
        """, [(oid, *x) for x in valid])

    return jsonify(ok=True, order_id=oid)


# Consultar pedidos.
@app.get("/api/orders")
def get_orders():
    with db() as c:
        orders = c.execute("""
            SELECT *
            FROM orders
            ORDER BY id DESC
            LIMIT 200
        """).fetchall()

        result = []

        for o in orders:
            items = c.execute("""
                SELECT name, price, quantity
                FROM order_items
                WHERE order_id = ?
                ORDER BY id
            """, (o["id"],)).fetchall()

            total = sum(
                i["price"] * i["quantity"] for i in items
            )

            result.append({
                **dict(o),
                "items": [dict(i) for i in items],
                "total": money(total)
            })

    return jsonify(result)


# Cambiar estado de un pedido.
@app.patch("/api/orders/<int:oid>")
def update_order(oid):
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    allowed = [
        "Recibido",
        "En preparación",
        "Listo",
        "Entregado",
        "Cancelado"
    ]

    if status not in allowed:
        return jsonify(error="Estado no válido."), 400

    with db() as c:
        cur = c.execute(
            "UPDATE orders SET status = ? WHERE id = ?",
            (status, oid)
        )

        if cur.rowcount == 0:
            return jsonify(error="Pedido no encontrado."), 404

    return jsonify(ok=True)


# Crear producto asociado a un proveedor.
@app.post("/api/products")
def add_product():
    data = request.get_json(silent=True) or {}

    category = str(data.get("category", "")).strip()[:60]
    name = str(data.get("name", "")).strip()[:100]

    try:
        price = float(data.get("price"))
    except (ValueError, TypeError):
        price = -1

    if not category or not name or price < 0 or price > 1000000:
        return jsonify(
            error="Completá proveedor, producto y precio válido."
        ), 400

    with db() as c:
        # Exigir que el proveedor ya exista.
        provider = c.execute(
            "SELECT id FROM categories WHERE name = ?",
            (category,)
        ).fetchone()

        if not provider:
            return jsonify(
                error="Elegí un proveedor existente."
            ), 400

        cur = c.execute("""
            INSERT INTO products(category, name, price)
            VALUES(?,?,?)
            RETURNING id
        """, (category, name, money(price)))

        product_id = cur.fetchone()["id"]

    return jsonify(ok=True, id=product_id)


# Desactivar producto sin borrar el historial de pedidos.
@app.delete("/api/products/<int:pid>")
def delete_product(pid):
    with db() as c:
        cur = c.execute(
            "UPDATE products SET active = 0 WHERE id = ?",
            (pid,)
        )

        if cur.rowcount == 0:
            return jsonify(error="Producto no encontrado."), 404

    return jsonify(ok=True)


@app.get("/health")
def health():
    return jsonify(ok=True)


init_db()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=PORT,
        debug=False,
        threaded=True
    )
    # Accessible to phones/tablets on the same Wi-Fi network.
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
