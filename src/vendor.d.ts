declare module 'nunjucks' {
  const nunjucks: any;
  export default nunjucks;
}

declare module 'nodemailer' {
  const nodemailer: any;
  export default nodemailer;
}

declare module 'pg' {
  export type QueryResult<T> = { rows: T[] };

  export class PoolClient {
    query<T = any>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
    release(): void;
  }

  export class Pool {
    constructor(config?: any);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<T = any>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
  }

  const pg: { Pool: typeof Pool };
  export default pg;
}
