import { DatabaseSync } from "node:sqlite";

class NodeD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new NodeD1Statement(this.database, this.sql, values);
  }

  first(columnName) {
    const row = this.database.prepare(this.sql).get(...this.values);
    if (!row) return null;
    return columnName ? row[columnName] : row;
  }

  all() {
    return {
      success: true,
      results: this.database.prepare(this.sql).all(...this.values)
    };
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0)
      }
    };
  }
}

export class NodeD1Database {
  constructor(filename = ":memory:") {
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new NodeD1Statement(this.database, sql);
  }

  batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => {
        if (!(statement instanceof NodeD1Statement) || statement.database !== this.database) {
          throw new TypeError("Batch statements must belong to this database.");
        }
        return statement.run();
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  exec(sql) {
    this.database.exec(sql);
  }

  close() {
    this.database.close();
  }
}
