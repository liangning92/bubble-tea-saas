declare module 'escpos' {
  export class Printer {
    constructor(device: any)
    font(font: string): this
    align(align: string): this
    text(text: string): this
    cut(): this
    close(callback?: () => void): void
  }
  export class Device {
    open(callback: (err?: any) => void): void
    close(callback?: () => void): void
    write(data: Buffer, callback?: (err?: any) => void): void
  }
}

declare module 'escpos-usb' {
  export class USB {
    static findPrinter(): Promise<any[]>
  }
}
