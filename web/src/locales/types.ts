/** Keep the Chinese structure while allowing each language its own string values. */
export type TranslationShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : TranslationShape<T[Key]>;
};
