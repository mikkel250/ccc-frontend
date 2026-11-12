import BoardPage from "../app/board/page";

type PageProps = {
  params?: Promise<unknown>;
  searchParams?: Promise<unknown>;
};

// Same assignability check Next 15.5 emits for a page's default export.
type Diff<Base, T extends Base> = 0 extends 1 & T ? Record<PropertyKey, never> : Omit<T, keyof Base>;
type FirstArg<T extends (...args: never[]) => unknown> = T extends (
  ...args: [infer Head, ...never[]]
) => unknown
  ? unknown extends Head
    ? never
    : Head
  : Record<PropertyKey, never>;

function checkFields<Fields extends { [key: PropertyKey]: never }>() {
  return undefined as unknown as Fields;
}

checkFields<Diff<PageProps, FirstArg<typeof BoardPage>>>();
