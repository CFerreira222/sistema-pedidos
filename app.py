
from flask import (
    Flask, render_template, request, jsonify, Response, send_file
)
import sqlite3
import os
import hmac
import io
import re
import posixpath
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle
)

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
        cur = self.conn.cursor()
        cur.execute(sql.replace("?", "%s"), params)
        return PgCursor(cur)

    def executemany(self, sql, seq):
        cur = self.conn.cursor()
        cur.executemany(sql.replace("?", "%s"), seq)
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


@app.before_request
def protect_admin():
    path, method = request.path, request.method

    protected = (
        path == "/admin"
        or (path == "/api/products/import" and method == "POST")
        or (path == "/api/products/manage" and method == "GET")
        or (path.startswith("/api/orders/") and path.endswith("/pdf") and method == "GET")
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
        or (
            path.startswith("/api/categories/")
            and method in ("PATCH", "DELETE")
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
        or not hmac.compare_digest(auth.username or "", expected_user)
        or not hmac.compare_digest(auth.password or "", expected_password)
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
            # Agrega la fecha solicitada sin modificar pedidos anteriores.
            c.execute(
                "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date TEXT"
            )
            # Archivar proveedores sin borrarlos ni perder sus productos.
            c.execute(
                "ALTER TABLE categories ADD COLUMN IF NOT EXISTS active INTEGER NOT NULL DEFAULT 1"
            )

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
            # Migración compatible con SQLite.
            order_columns = c.execute("PRAGMA table_info(orders)").fetchall()
            if not any(column["name"] == "order_date" for column in order_columns):
                c.execute("ALTER TABLE orders ADD COLUMN order_date TEXT")
            category_columns = c.execute("PRAGMA table_info(categories)").fetchall()
            if not any(column["name"] == "active" for column in category_columns):
                c.execute("ALTER TABLE categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1")

        count = c.execute(
            "SELECT COUNT(*) AS n FROM products"
        ).fetchone()["n"]

        if count == 0:
            c.executemany(
                "INSERT INTO products(category, name, price) VALUES(?,?,?)",
                DEFAULT_PRODUCTS
            )

        c.execute("""
            INSERT INTO categories(name)
            SELECT DISTINCT TRIM(category)
            FROM products
            WHERE TRIM(category) <> ''
            ON CONFLICT(name) DO NOTHING
        """)


def money(n):
    return round(float(n), 2)


def generar_pdf_pedido(oid, customer, notes, items, order_date):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=20 * mm, leftMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm
    )
    styles = getSampleStyleSheet()

    try:
        fecha_legible = datetime.strptime(order_date, "%Y-%m-%d").strftime("%d/%m/%Y")
    except (ValueError, TypeError):
        fecha_legible = str(order_date)

    content = [
        Paragraph(f"<b>PEDIDO #{oid}</b>", styles["Title"]),
        Spacer(1, 6 * mm),
        Paragraph(f"<b>Solicitante:</b> {escape(customer)}", styles["Normal"]),
        Paragraph(f"<b>Fecha solicitada:</b> {escape(fecha_legible)}", styles["Normal"]),
        Spacer(1, 7 * mm)
    ]

    table_data = [["Cantidad", "Producto"]]
    for item in items:
        table_data.append([
            str(int(item[3])),
            Paragraph(escape(str(item[1])), styles["BodyText"])
        ])

    table = Table(table_data, colWidths=[28 * mm, 137 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    content.append(table)

    if notes:
        content.extend([
            Spacer(1, 8 * mm),
            Paragraph(f"<b>Observaciones:</b> {escape(notes)}", styles["BodyText"])
        ])

    doc.build(content)
    buffer.seek(0)
    return buffer


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.get("/api/categories")
def get_categories():
    # Sólo Administración puede ver esta ruta (Basic Auth).
    include_inactive = request.args.get("include_inactive") == "1"
    with db() as c:
        if include_inactive:
            rows = c.execute(
                "SELECT id, name, active FROM categories ORDER BY name"
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT id, name, active FROM categories WHERE active = 1 ORDER BY name"
            ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/categories")
def add_category():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip()
    if not name or len(name) > 60:
        return jsonify(error="Ingresá un proveedor de hasta 60 caracteres."), 400
    with db() as c:
        existing = c.execute(
            "SELECT id FROM categories WHERE lower(name) = lower(?)", (name,)
        ).fetchone()
        if existing:
            return jsonify(error="Ya existe un proveedor con ese nombre."), 409
        row = c.execute(
            "INSERT INTO categories(name) VALUES(?) RETURNING id", (name,)
        ).fetchone()
    return jsonify(ok=True, id=row["id"], name=name)


@app.patch("/api/categories/<int:category_id>")
def edit_category(category_id):
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict) or not any(k in data for k in ("name", "active")):
        return jsonify(error="No se recibieron cambios de proveedor."), 400

    with db() as c:
        existing = c.execute(
            "SELECT id, name, active FROM categories WHERE id = ?", (category_id,)
        ).fetchone()
        if not existing:
            return jsonify(error="Proveedor no encontrado."), 404

        new_name = existing["name"]
        if "name" in data:
            new_name = str(data["name"] or "").strip()
            if not new_name or len(new_name) > 60:
                return jsonify(error="El nombre del proveedor debe tener entre 1 y 60 caracteres."), 400
            duplicate = c.execute(
                "SELECT id FROM categories WHERE lower(name) = lower(?) AND id != ?",
                (new_name, category_id)
            ).fetchone()
            if duplicate:
                return jsonify(error="Ya existe otro proveedor con ese nombre."), 409

        new_active = existing["active"]
        if "active" in data:
            if type(data["active"]) is not bool:
                return jsonify(error="Estado del proveedor no válido."), 400
            new_active = 1 if data["active"] else 0
            if new_active == 0:
                active_products = c.execute(
                    "SELECT COUNT(*) AS n FROM products WHERE category = ? AND active = 1",
                    (existing["name"],)
                ).fetchone()["n"]
                if active_products:
                    return jsonify(error="Primero desactivá o mové los productos activos de este proveedor."), 409

        # Nombre y vínculo de los productos se actualizan en la misma transacción.
        if new_name != existing["name"]:
            c.execute(
                "UPDATE products SET category = ? WHERE category = ?",
                (new_name, existing["name"])
            )
        c.execute(
            "UPDATE categories SET name = ?, active = ? WHERE id = ?",
            (new_name, new_active, category_id)
        )
    return jsonify(ok=True, name=new_name, active=new_active)


@app.delete("/api/categories/<int:category_id>")
def delete_category(category_id):
    # Eliminación física sólo de proveedores que nunca tuvieron artículos.
    with db() as c:
        provider = c.execute(
            "SELECT id, name FROM categories WHERE id = ?", (category_id,)
        ).fetchone()
        if not provider:
            return jsonify(error="Proveedor no encontrado."), 404
        linked = c.execute(
            "SELECT COUNT(*) AS n FROM products WHERE category = ?",
            (provider["name"],)
        ).fetchone()["n"]
        if linked:
            return jsonify(error="Este proveedor conserva artículos activos o históricos. Usá Archivar proveedor cuando no tenga artículos activos."), 409
        c.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    return jsonify(ok=True, message="Proveedor vacío eliminado.")


# -------------------- IMPORTACIÓN DE EXCEL --------------------
# Lee archivos .xlsx con la biblioteca estándar de Python.
# No necesita instalar dependencias y nunca modifica datos existentes.

XLSX_NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
XLSX_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
MAX_EXCEL_BYTES = 5 * 1024 * 1024
MAX_EXCEL_ROWS = 5000


def normalizar_encabezado(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def columna_excel(ref):
    letters = re.match(r"[A-Za-z]+", ref or "")
    if not letters:
        return None
    col = 0
    for char in letters.group().upper():
        col = col * 26 + ord(char) - ord("A") + 1
    return col - 1


def leer_excel_productos(raw):
    """Obtiene (número_fila, proveedor, producto) de la primera hoja .xlsx."""
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = set(archive.namelist())
            if "xl/workbook.xml" not in names:
                raise ValueError("El archivo no parece ser un Excel .xlsx válido.")
            if len(names) > 200 or sum(i.file_size for i in archive.infolist()) > 25 * 1024 * 1024:
                raise ValueError("El Excel tiene demasiados datos para importar.")

            workbook = ET.fromstring(archive.read("xl/workbook.xml"))
            first_sheet = workbook.find("m:sheets/m:sheet", XLSX_NS)
            if first_sheet is None:
                raise ValueError("El Excel no contiene hojas.")

            sheet_rel = first_sheet.attrib.get("{" + XLSX_REL + "}id")
            rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            targets = {
                element.attrib.get("Id"): element.attrib.get("Target", "")
                for element in rel_root.findall("{" + PACKAGE_REL + "}Relationship")
            }
            target = targets.get(sheet_rel, "")
            if not target:
                raise ValueError("No se pudo leer la primera hoja del Excel.")

            sheet_path = (target.lstrip("/") if target.startswith("/")
                          else posixpath.normpath(posixpath.join("xl", target)))
            if sheet_path not in names or not sheet_path.startswith("xl/worksheets/"):
                raise ValueError("No se pudo localizar la primera hoja del Excel.")

            shared_strings = []
            if "xl/sharedStrings.xml" in names:
                strings_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                for entry in strings_root.findall("m:si", XLSX_NS):
                    shared_strings.append("".join(
                        node.text or "" for node in entry.iter("{" + XLSX_NS["m"] + "}t")
                    ))

            sheet = ET.fromstring(archive.read(sheet_path))
            xml_rows = sheet.findall("m:sheetData/m:row", XLSX_NS)
            if len(xml_rows) > MAX_EXCEL_ROWS + 5:
                raise ValueError("El Excel supera el límite de 5000 filas.")

            rows = []
            for xml_row in xml_rows:
                cells = {}
                for cell in xml_row.findall("m:c", XLSX_NS):
                    index = columna_excel(cell.attrib.get("r", ""))
                    if index is None or index > 200:
                        continue
                    cell_type = cell.attrib.get("t")
                    if cell_type == "inlineStr":
                        value = "".join(
                            n.text or "" for n in cell.iter("{" + XLSX_NS["m"] + "}t")
                        )
                    else:
                        value_tag = cell.find("m:v", XLSX_NS)
                        value = value_tag.text if value_tag is not None else ""
                        if cell_type == "s" and value:
                            string_index = int(value)
                            value = shared_strings[string_index]
                    cells[index] = str(value or "").strip()
                if any(cells.values()):
                    rows.append((int(xml_row.attrib.get("r", len(rows) + 1)), cells))

    except (zipfile.BadZipFile, ET.ParseError, KeyError, IndexError, ValueError) as exc:
        if isinstance(exc, ValueError) and str(exc).startswith("El Excel"):
            raise
        raise ValueError("No se pudo leer el Excel. Guardalo como archivo .xlsx válido.") from exc

    if not rows:
        raise ValueError("El Excel está vacío.")

    _, header = rows[0]
    keys = {normalizar_encabezado(text): column for column, text in header.items()}

    product_headers = ("producto", "articulo", "nombre", "name", "productname", "nombreproducto", "nombrearticulo")
    provider_headers = ("proveedor", "supplier", "categoria", "category")

    product_col = next((keys[key] for key in product_headers if key in keys), None)
    provider_col = next((keys[key] for key in provider_headers if key in keys), None)

    if product_col is None:
        raise ValueError(
            "No encuentro una columna 'Producto', 'Artículo' o 'name' en la primera fila."
        )

    output = []
    for row_number, cells in rows[1:]:
        name = cells.get(product_col, "").strip()
        provider = cells.get(provider_col, "").strip() if provider_col is not None else ""
        if not name:
            continue
        if len(name) > 100:
            raise ValueError(f"Fila {row_number}: el nombre del artículo supera 100 caracteres.")
        if len(provider) > 60:
            raise ValueError(f"Fila {row_number}: el proveedor supera 60 caracteres.")
        output.append((row_number, provider, name))

    if not output:
        raise ValueError("El Excel no contiene artículos para importar.")
    if len(output) > MAX_EXCEL_ROWS:
        raise ValueError("El Excel supera el límite de 5000 artículos.")
    return output


@app.post("/api/products/import")
def import_products_excel():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename or not uploaded.filename.lower().endswith(".xlsx"):
        return jsonify(error="Seleccioná un archivo Excel .xlsx."), 400

    raw = uploaded.read(MAX_EXCEL_BYTES + 1)
    if len(raw) > MAX_EXCEL_BYTES:
        return jsonify(error="El Excel supera los 5 MB permitidos."), 400

    default_provider = str(request.form.get("category", "")).strip()
    preview = request.form.get("preview") == "1"

    try:
        incoming = leer_excel_productos(raw)
    except ValueError as error:
        return jsonify(error=str(error)), 400

    with db() as c:
        existing_providers = c.execute("SELECT name FROM categories WHERE active = 1").fetchall()
        providers = {p["name"].casefold(): p["name"] for p in existing_providers}
        known_products = c.execute("SELECT category, name FROM products").fetchall()
        known = {(p["category"].casefold(), p["name"].casefold()) for p in known_products}

        to_add = []
        duplicates = 0
        seen = set()
        problems = []

        for line, excel_provider, name in incoming:
            provider_input = excel_provider or default_provider
            provider = providers.get(provider_input.casefold())
            if not provider:
                problems.append(f"Fila {line}: proveedor '{provider_input or '(sin proveedor)'}' no existe.")
                if len(problems) >= 10:
                    break
                continue

            key = (provider.casefold(), name.casefold())
            if key in known or key in seen:
                duplicates += 1
                continue
            seen.add(key)
            to_add.append((provider, name, 0))

        if problems:
            return jsonify(error="No se importó nada. " + " ".join(problems)), 400

        if not preview and to_add:
            c.executemany(
                "INSERT INTO products(category, name, price) VALUES(?,?,?)",
                to_add
            )

    return jsonify(
        ok=True,
        preview=preview,
        total=len(incoming),
        added=0 if preview else len(to_add),
        new_count=len(to_add),
        duplicates=duplicates,
        examples=[{"provider": provider, "name": name} for provider, name, _ in to_add[:12]]
    )


@app.get("/api/products/manage")
def products_for_admin():
    # Incluye desactivados para que se puedan recuperar; no devuelve precios.
    with db() as c:
        rows = c.execute("""
            SELECT id, category, name, active
            FROM products ORDER BY category, name, id
        """).fetchall()
    return jsonify([dict(row) for row in rows])


@app.get("/api/products")
def products():
    with db() as c:
        rows = c.execute("""
            SELECT id, category, name
            FROM products
            WHERE active = 1
            ORDER BY category, name
        """).fetchall()

    return jsonify([dict(r) for r in rows])


@app.post("/api/orders")
def create_order():
    data = request.get_json(silent=True) or {}
    customer = str(data.get("customer", "")).strip()[:100]
    order_date = str(data.get("order_date", "")).strip()
    items = data.get("items", [])
    notes = str(data.get("notes", "")).strip()[:500]

    if not customer:
        return jsonify(error="Ingresá el nombre del solicitante."), 400

    try:
        datetime.strptime(order_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return jsonify(error="Seleccioná una fecha válida para el pedido."), 400

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

            product = c.execute("""
                SELECT id, name, price
                FROM products
                WHERE id = ? AND active = 1
            """, (pid,)).fetchone()

            if product:
                # Se conserva el campo histórico price, sin mostrarlo.
                valid.append((product["id"], product["name"], money(product["price"]), qty))

        if not valid:
            return jsonify(error="No hay productos válidos en el pedido."), 400

        now = datetime.now().astimezone().strftime("%d/%m/%Y %H:%M")
        cur = c.execute("""
            INSERT INTO orders(customer, notes, status, created_at, order_date)
            VALUES(?,?,?,?,?)
            RETURNING id
        """, (customer, notes, "Pedido", now, order_date))
        order_id = cur.fetchone()["id"]

        c.executemany("""
            INSERT INTO order_items(order_id, product_id, name, price, quantity)
            VALUES(?,?,?,?,?)
        """, [(order_id, *item) for item in valid])

        pdf = generar_pdf_pedido(order_id, customer, notes, valid, order_date)

    response = send_file(
        pdf, mimetype="application/pdf", as_attachment=True,
        download_name=f"pedido_{order_id}.pdf"
    )
    response.headers["X-Order-ID"] = str(order_id)
    return response


@app.get("/api/orders")
def get_orders():
    with db() as c:
        orders = c.execute("""
            SELECT * FROM orders
            ORDER BY id DESC
            LIMIT 200
        """).fetchall()

        result = []
        for order in orders:
            items = c.execute("""
                SELECT name, quantity
                FROM order_items
                WHERE order_id = ?
                ORDER BY id
            """, (order["id"],)).fetchall()

            result.append({
                **dict(order),
                "items": [dict(item) for item in items]
            })

    return jsonify(result)


@app.get("/api/orders/<int:oid>/pdf")
def descargar_pdf_pedido(oid):
    # Descarga de pedidos existentes: no se crea un nuevo pedido.
    with db() as c:
        order = c.execute(
            "SELECT id, customer, notes, order_date FROM orders WHERE id = ?",
            (oid,)
        ).fetchone()
        if not order:
            return jsonify(error="Pedido no encontrado."), 404

        rows = c.execute("""
            SELECT product_id, name, price, quantity
            FROM order_items WHERE order_id = ? ORDER BY id
        """, (oid,)).fetchall()

    if not rows:
        return jsonify(error="El pedido no tiene productos."), 404

    items = [
        (row["product_id"], row["name"], row["price"], row["quantity"])
        for row in rows
    ]
    pdf = generar_pdf_pedido(
        order["id"], order["customer"], order["notes"],
        items, order["order_date"] or "No indicada"
    )
    return send_file(
        pdf, mimetype="application/pdf", as_attachment=True,
        download_name=f"pedido_{oid}.pdf"
    )


@app.patch("/api/orders/<int:oid>")
def update_order(oid):
    data = request.get_json(silent=True) or {}
    status = data.get("status")

    allowed = [
        "Pedido",
        "Recibido",
        "Sin stock"
    ]

    if status not in allowed:
        return jsonify(
            error="Estado no válido."
        ), 400

    with db() as c:
        cur = c.execute(
            "UPDATE orders SET status = ? WHERE id = ?",
            (status, oid)
        )

        if cur.rowcount == 0:
            return jsonify(
                error="Pedido no encontrado."
            ), 404

    return jsonify(ok=True)


def find_active_provider(c, name):
    return c.execute(
        "SELECT id, name FROM categories WHERE lower(name) = lower(?) AND active = 1",
        (name,)
    ).fetchone()


def duplicate_product(c, provider, name, exclude_id=None):
    if exclude_id is None:
        return c.execute("""
            SELECT id FROM products
            WHERE lower(category) = lower(?) AND lower(name) = lower(?) AND active = 1
            LIMIT 1
        """, (provider, name)).fetchone()
    return c.execute("""
        SELECT id FROM products
        WHERE lower(category) = lower(?) AND lower(name) = lower(?)
          AND active = 1 AND id != ? LIMIT 1
    """, (provider, name, exclude_id)).fetchone()


@app.post("/api/products")
def add_product():
    data = request.get_json(silent=True) or {}
    category = str(data.get("category") or "").strip()
    name = str(data.get("name") or "").strip()
    if not category or not name or len(name) > 100 or len(category) > 60:
        return jsonify(error="Completá proveedor y nombre (máximo 100 caracteres)."), 400

    with db() as c:
        provider = find_active_provider(c, category)
        if not provider:
            return jsonify(error="Elegí un proveedor activo existente."), 400
        if duplicate_product(c, provider["name"], name):
            return jsonify(error="Ese producto ya existe activo en ese proveedor."), 409
        product_id = c.execute("""
            INSERT INTO products(category, name, price) VALUES(?,?,?) RETURNING id
        """, (provider["name"], name, 0)).fetchone()["id"]
    return jsonify(ok=True, id=product_id)


@app.patch("/api/products/<int:pid>")
def edit_product(pid):
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict) or not any(k in data for k in ("name", "category", "active")):
        return jsonify(error="No se recibieron cambios de producto."), 400

    with db() as c:
        product = c.execute(
            "SELECT id, name, category, active FROM products WHERE id = ?", (pid,)
        ).fetchone()
        if not product:
            return jsonify(error="Producto no encontrado."), 404

        name = str(data["name"] or "").strip() if "name" in data else product["name"]
        category = str(data["category"] or "").strip() if "category" in data else product["category"]
        if not name or not category or len(name) > 100 or len(category) > 60:
            return jsonify(error="Nombre o proveedor no válido."), 400

        active = int(product["active"])
        if "active" in data:
            if type(data["active"]) is not bool:
                return jsonify(error="Estado del producto no válido."), 400
            active = 1 if data["active"] else 0

        provider = find_active_provider(c, category)
        if not provider and (active == 1 or "category" in data):
            return jsonify(error="Para activar o mover el producto elegí un proveedor activo."), 409
        if provider:
            category = provider["name"]

        if active and duplicate_product(c, category, name, pid):
            return jsonify(error="Ya existe un producto activo con ese nombre en el proveedor."), 409

        c.execute(
            "UPDATE products SET name = ?, category = ?, active = ? WHERE id = ?",
            (name, category, active, pid)
        )
    return jsonify(ok=True, id=pid, name=name, category=category, active=active)


@app.delete("/api/products/<int:pid>")
def delete_product(pid):
    # Nunca borramos físicamente; se conserva la fila y los pedidos anteriores.
    with db() as c:
        cur = c.execute(
            "UPDATE products SET active = 0 WHERE id = ? AND active = 1", (pid,)
        )
        if cur.rowcount == 0:
            return jsonify(error="Producto no encontrado o ya desactivado."), 404
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
