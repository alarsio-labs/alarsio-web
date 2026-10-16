// A DeviceDb backed by in-memory sql.js, for Jest only. Never imported by the app.
// sql.js is SQLite compiled to WebAssembly: no native build, so it runs on Windows
// and on CI's Node 20, and our SQL is executed for real rather than mocked.

import initSqlJs from 'sql.js';

import { serialTransactions, type DeviceDb } from '../device-db';

export async function openTestDeviceDb(): Promise<DeviceDb> {
  const SQL = await initSqlJs();
  const raw = new SQL.Database();

  const exec = async (sql: string) => {
    raw.exec(sql);
  };

  return {
    exec,
    async run(sql, params = []) {
      raw.run(sql, [...params]);
      return { changes: raw.getRowsModified() };
    },
    async all<Row>(sql: string, params: readonly (string | number | null | Uint8Array)[] = []) {
      const statement = raw.prepare(sql);
      try {
        statement.bind([...params]);
        const rows: Row[] = [];
        while (statement.step()) {
          rows.push(statement.getAsObject() as Row);
        }
        return rows;
      } finally {
        statement.free();
      }
    },
    transaction: serialTransactions(exec),
  };
}
