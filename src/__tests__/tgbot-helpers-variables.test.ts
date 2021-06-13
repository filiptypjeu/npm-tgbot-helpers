import { LocalStorage } from "node-localstorage";
import { IVariable, VariableManager } from "../VariableManager";

const ls = new LocalStorage("./src/__tests__/variables/");
ls.setItem("VARIABLES_GLOBAL", "");
ls.setItem("VARIABLES_1234", "");
ls.removeItem("VARIABLES_abcd");

const variables: IVariable[] = [
  {
    name: "var1",
    defaultValue: "a string",
  },
  {
    name: "var2",
    defaultValue: 123,
  },
];

const varMgr = new VariableManager(variables, ls);

test("get default values with no domain", () => {
  expect(varMgr.get("var1")).toEqual("a string");
  expect(varMgr.get("var2")).toEqual(123);
  expect(varMgr.get("var")).toEqual("");
});

test("get default values with a domain", () => {
  expect(varMgr.get("var1", "_domain_")).toEqual("a string");
  expect(varMgr.get("var2", 1234)).toEqual(123);
  expect(varMgr.get("var", "hello")).toEqual("");
});

test("set and get values with no domain", () => {
  varMgr.set("var1", "value1");
  expect(varMgr.get("var1")).toEqual("value1");

  varMgr.set("var2", "value2");
  expect(varMgr.get("var2")).toEqual("value2");

  varMgr.set("var", "value");
  expect(varMgr.get("var")).toEqual("value");
});

test("set and get values with a domain", () => {
  varMgr.set("var1", 42, 1234);
  expect(varMgr.get("var1", "1234")).toEqual(42);

  varMgr.set("var2", 69, "1234");
  expect(varMgr.get("var2", 1234)).toEqual(69);

  varMgr.set("var", "69", "abcd");
  expect(varMgr.get("var", "abcd")).toEqual("69");
});

test("get raw localstorage items", () => {
  expect(ls.getItem("VARIABLES_GLOBAL")).toEqual('{"var1":"value1","var2":"value2","var":"value"}');
  expect(ls.getItem("VARIABLES_1234")).toEqual('{"var1":42,"var2":69}');
  expect(ls.getItem("VARIABLES_abcd")).toEqual('{"var":"69"}');
});
