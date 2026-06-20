export class Pool {
  constructor() {}
  async connect() {}
  async query(text, params) {
    if (text.includes('GROUP BY')) {
      return { rows: [] };
    }
    return { rows: [{ cnt: '0' }] };
  }
}
