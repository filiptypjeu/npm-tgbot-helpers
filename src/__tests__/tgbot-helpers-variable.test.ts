import { LocalStorage } from "node-localstorage";
import { BooleanVariable, ObjectVariable, StringVariable, Variable } from "../Variable";

const ls = new LocalStorage("./src/__tests__/variables/");
ls.setItem("VARIABLES_", "");
ls.setItem("VARIABLES_1234", "");
ls.removeItem("VARIABLES_abcd");

const var1 = new Variable<string>("var1", "hello", ls);
const var2 = new Variable<number>("var2", 123, ls);

test("correct item names", () => {
  expect(var1.itemName()).toEqual("VARIABLES_");
  expect(var2.itemName()).toEqual("VARIABLES_");
  expect(var1.itemName(1234)).toEqual("VARIABLES_1234");
  expect(var2.itemName("1234")).toEqual("VARIABLES_1234");
});

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

interface ITestA {
  a: string[];
  b: number[];
  c?: ITestA;
}

const d: ITestA = {
  a: ["a"],
  b: [1],
};

const var3 = new Variable<ITestA>("var3", d, ls);

test("get default value for complex type", () => {
  expect(var3.get()).toEqual(d);
  expect(var3.get(1234)).toEqual(d);
});

d.b = [42, 43];
d.c = {
  a: ["b", "c"],
  b: [2, 3],
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
  expect(ls.getItem("VARIABLES_")).toEqual("{}");
});

test("reset values with domain", () => {
  var1.reset(1234);
  expect(var1.get("1234")).toEqual("hello");
  var2.reset("1234");
  expect(var2.get(1234)).toEqual(123);
  var3.reset(1234);
  expect(ls.getItem("VARIABLES_1234")).toEqual("{}");
});

test("test type", () => {
  expect(var1.type).toEqual("string");
  expect(var2.type).toEqual("number");
  expect(var3.type).toEqual("object");
});

const var4 = new StringVariable("var4", "default", ls);

test("stringvariable", () => {
  expect(var4.type).toEqual("string");
  expect(var4.get()).toEqual("default");
  expect(var4.set("987654")).toEqual(true);
  expect(var4.get()).toEqual("987654");
});

const var5 = new BooleanVariable("var5", false, ls);

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

test("booleanvariable toggle", () => {
  expect(var5.toggle()).toEqual(true);
  expect(var5.toggle()).toEqual(false);
  expect(var5.toggle()).toEqual(true);

  expect(var5.toggle("1234")).toEqual(true);
  expect(var5.toggle("1234")).toEqual(false);
  expect(var5.toggle("1234")).toEqual(true);

  expect(var5.set(false, "1234")).toEqual(true);
  expect(var5.toggle("1234")).toEqual(true);
});

interface ITestB {
  a: number;
  b?: string;
  c?: ITestB;
}

const var6 = new ObjectVariable<ITestB>("var6", { a: 1 }, ls);

test("objectvariable", () => {
  // Test default value
  expect(var6.get()).toEqual({ a: 1 });
  expect(var6.getProperty("a")).toEqual(1);
  expect(var6.getProperty("b")).toEqual(undefined);
  expect(var6.getProperty("c")).toEqual(undefined);

  // Test set
  expect(var6.set({ a: 2, b: "h" })).toEqual(true);
  expect(var6.get()).toEqual({ a: 2, b: "h" });
  expect(var6.getProperty("a")).toEqual(2);
  expect(var6.getProperty("b")).toEqual("h");
  expect(var6.getProperty("c")).toEqual(undefined);

  // Test setPartial
  expect(var6.setPartial({ a: 3, c: var6.get() })).toEqual(true);
  expect(var6.get()).toEqual({ a: 3, b: "h", c: { a: 2, b: "h" } });
  expect(var6.getProperty("a")).toEqual(3);
  expect(var6.getProperty("b")).toEqual("h");
  expect(var6.getProperty("c")).toEqual({ a: 2, b: "h" });

  // Test setPartial undefined
  expect(var6.setPartial({ c: undefined })).toEqual(true);
  expect(var6.get()).toEqual({ a: 3, b: "h" });

  // Test setProperty undefined
  expect(var6.setProperty("b", undefined)).toEqual(true);
  expect(var6.get()).toEqual({ a: 3 });

  // Test reset
  var6.reset();
  expect(var6.get()).toEqual({ a: 1 });
  expect(var6.getProperty("a")).toEqual(1);
  expect(var6.getProperty("b")).toEqual(undefined);
  expect(var6.getProperty("c")).toEqual(undefined);

  // Test setProperty
  expect(var6.setProperty("a", 5, 1234)).toEqual(true);
  expect(var6.getProperty("a", 1234)).toEqual(5);
  expect(var6.setProperty("b", "k", 1234)).toEqual(true);
  expect(var6.getProperty("b", 1234)).toEqual("k");
  expect(var6.get(1234)).toEqual({ a: 5, b: "k" });

  // Test resetProperty
  expect(var6.resetProperty("a", 1234)).toEqual(1);
  expect(var6.get(1234)).toEqual({ a: 1, b: "k" });

  // Test resetProperty
  expect(var6.resetProperty("b", 1234)).toEqual(undefined);
  expect(var6.get(1234)).toEqual({ a: 1 });
});

var mynymber = 0;
var mydomain: string | undefined;
const var7 = new Variable<number>("var7", 100, ls, (newValue: number, domain?: string) => {
  mynymber = newValue + 1;
  mydomain = domain;
});

test("variable with callback", () => {
  // Test default value
  expect(mynymber).toEqual(0);
  expect(mydomain).toEqual(undefined);

  // Set value
  var7.set(42);
  expect(mynymber).toEqual(43);
  expect(mydomain).toEqual(undefined);

  // Reset value
  var7.reset();
  expect(mynymber).toEqual(101);
  expect(mydomain).toEqual(undefined);

  // Set value in domain
  var7.set(42, "abc");
  expect(mynymber).toEqual(43);
  expect(mydomain).toEqual("abc");

  // Reset value in domain
  var7.reset("abc");
  expect(mynymber).toEqual(101);
  expect(mydomain).toEqual("abc");

  // Reset value in another domain
  var7.reset("def");
  expect(mynymber).toEqual(101);
  expect(mydomain).toEqual("def");
});
