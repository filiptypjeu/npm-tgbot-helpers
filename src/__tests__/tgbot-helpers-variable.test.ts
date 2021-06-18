import { LocalStorage } from "node-localstorage";
import { BooleanVariable, StringVariable, Variable } from "../Variable";

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
  // Set string variable
  expect(var1.set("AAA")).toEqual(true);
  expect(var1.get()).toEqual("AAA");

  // Set number variable with number
  expect(var2.set(321)).toEqual(true);
  expect(var2.get()).toEqual(321);

  // Set number variable with string not passing JSON.parse()
  expect(var2.set("abc")).toEqual(false);
  expect(var2.get()).toEqual(321);

  // Set number variable with string not parsed to number
  expect(var2.set("{}")).toEqual(false);
  expect(var2.get()).toEqual(321);

  // Set number variable with ok string
  expect(var2.set("456")).toEqual(true);
  expect(var2.get()).toEqual(456);
});

test("get default values with domain", () => {
  expect(var1.get("abcd")).toEqual("hello");
  expect(var1.get("1234")).toEqual("hello");
  expect(var1.get(1234)).toEqual("hello");
});

test("set and get values with domain", () => {
  // Set string variable
  expect(var1.set("BBB", "abcd")).toEqual(true);
  expect(var1.get("abcd")).toEqual("BBB");
  expect(var1.set("789", 1234)).toEqual(true);
  expect(var1.get("1234")).toEqual("789");
  expect(var2.set(789, "1234")).toEqual(true);
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
  expect(var3.set(d)).toEqual(true);
  expect(var3.get()).toEqual(d);
  expect(var3.set(d, 1234)).toEqual(true);
  expect(var3.get(1234)).toEqual(d);
  expect(var3.set("{}", 1234)).toEqual(true);
  expect(var3.get(1234)).toEqual({});
  expect(var3.set('{"a":"almost ok}', 1234)).toEqual(false);
  expect(var3.get(1234)).toEqual({});

  expect(ls.getItem("VARIABLES_")).toEqual('{"var1":"AAA","var2":456,"var3":{"a":["a"],"b":[42,43],"c":{"a":["b","c"],"b":[2,3]}}}');
});

test("reset values with no domain", () => {
  var1.reset();
  expect(var1.get()).toEqual("hello");
  var2.reset();
  expect(var2.get()).toEqual(123);
  var3.reset();
  expect(ls.getItem("VARIABLES_")).toEqual('{}');
});

test("reset values with domain", () => {
  var1.reset(1234);
  expect(var1.get("1234")).toEqual("hello");
  var2.reset("1234");
  expect(var2.get(1234)).toEqual(123);
  var3.reset(1234);
  expect(ls.getItem("VARIABLES_1234")).toEqual('{}');
});

test("test type", () => {
  expect(var1.type).toEqual("string");
  expect(var2.type).toEqual("number");
  expect(var3.type).toEqual("object");
});

const var4 = new StringVariable("var1", "default", ls);

test("stringvariable", () => {
  expect(var4.type).toEqual("string");
  expect(var4.get()).toEqual("default");
  expect(var4.set("987654")).toEqual(true);
  expect(var4.get()).toEqual("987654");
});

const var5 = new BooleanVariable("var2", false, ls);

test("booleanvariable", () => {
  expect(var5.type).toEqual("boolean");
  expect(var5.get()).toEqual(false);
  expect(var5.set(true)).toEqual(true);
  expect(var5.get()).toEqual(true);
  expect(var5.set(false)).toEqual(true);
  expect(var5.get()).toEqual(false);
  expect(var5.set("987654")).toEqual(true);
  expect(var5.get()).toEqual(true);
  expect(var5.set("0")).toEqual(true);
  expect(var5.get()).toEqual(false);
  expect(var5.set("abc")).toEqual(true);
  expect(var5.get()).toEqual(true);
  expect(var5.set("")).toEqual(true);
  expect(var5.get()).toEqual(false);
});
