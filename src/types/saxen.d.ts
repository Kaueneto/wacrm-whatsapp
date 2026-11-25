declare module 'saxen' {
  export class Parser {
    on(event: 'openTag', handler: (name: string) => void): this;
    on(event: 'closeTag', handler: (name: string) => void): this;
    on(
      event: 'text',
      handler: (text: string, decode: (value: string) => string) => void
    ): this;
    on(event: 'cdata', handler: (text: string) => void): this;
    on(event: 'error', handler: (error: Error) => void): this;
    parse(xml: string): void;
  }
}
