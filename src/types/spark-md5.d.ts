declare module "spark-md5" {
  class SparkMD5 {
    static hash(value: string, raw?: boolean): string;
  }

  namespace SparkMD5 {
    class ArrayBuffer {
      append(data: globalThis.ArrayBuffer): this;
      end(raw?: boolean): string;
      reset(): void;
    }
  }

  export default SparkMD5;
}
