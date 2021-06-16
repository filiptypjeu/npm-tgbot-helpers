import { LocalStorage } from "node-localstorage";
import { Variable } from "../Variable";

const ls = new LocalStorage("./src/__tests__/variables/");
ls.setItem("VARIABLES_", "");
ls.setItem("VARIABLES_1234", "");
ls.removeItem("VARIABLES_abcd");

const var1 = new Variable<string>("var1", "hello", ls);
const var2 = new Variable<number>("var2", 123, ls);

test("get default values with no domain", () => {
  expect(var1.get()).toEqual("hello");
  expect(var2.get()).toEqual(123);
});

test("set and get values with no domain", () => {
  var1.set("AAA")
  expect(var1.get()).toEqual("AAA");
  var2.set(456)
  expect(var2.get()).toEqual(456);
});

test("get default values with domain", () => {
  expect(var1.get("abcd")).toEqual("hello");
  expect(var1.get("1234")).toEqual("hello");
  expect(var1.get(1234)).toEqual("hello");
});

test("set and get values with domain", () => {
  var1.set("BBB", "abcd");
  expect(var1.get("abcd")).toEqual("BBB");
  var1.set("789", 1234)
  expect(var1.get("1234")).toEqual("789");
  var2.set(789, "1234")
  expect(var2.get(1234)).toEqual(789);
});

test("get raw localstorage items", () => {
  expect(ls.getItem("VARIABLES_")).toEqual('{"var1":"AAA","var2":456}');
  expect(ls.getItem("VARIABLES_abcd")).toEqual('{"var1":"BBB"}');
  expect(ls.getItem("VARIABLES_1234")).toEqual('{"var1":"789","var2":789}');
});

interface ITest {
  a: string[];
  b: number[];
  c?: ITest;
};

const d: ITest = {
  a: ["a"],
  b: [1],
}

const var3 = new Variable<ITest>("var3", d, ls);

test("get default value for complex type", () => {
  expect(var3.get()).toEqual(d);
  expect(var3.get(1234)).toEqual(d);
});

d.b = [42, 43];
d.c = {
  a: ["b", "c"],
  b: [ 2, 3 ],
};

test("set and get value for complex type", () => {
  var3.set(d)
  expect(var3.get()).toEqual(d);
  var3.set(d, 1234)
  expect(var3.get(1234)).toEqual(d);

  expect(ls.getItem("VARIABLES_")).toEqual('{"var1":"AAA","var2":456,"var3":{"a":["a"],"b":[42,43],"c":{"a":["b","c"],"b":[2,3]}}}');
});
