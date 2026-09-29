import sqlite3
import json

def export_db():
    conn = sqlite3.connect('thermashell.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    db_data = {}
    for table in tables:
        table_name = table['name']
        cursor.execute(f"SELECT * FROM {table_name}")
        rows = cursor.fetchall()
        db_data[table_name] = [dict(row) for row in rows]
        
    with open('thermashell_export.json', 'w') as f:
        json.dump(db_data, f, indent=2)
        
    conn.close()
    print("Database exported to thermashell_export.json")

if __name__ == '__main__':
    export_db()
