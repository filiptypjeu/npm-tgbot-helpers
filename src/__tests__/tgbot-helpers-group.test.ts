import { LocalStorage } from "node-localstorage";
import { Group } from "../Group";

const ls = new LocalStorage("./src/__tests__/variables/");

const group1 = new Group("name1", ls);
const group2 = new Group("name2", ls);

ls.setItem(group1.itemName, "");
ls.removeItem(group2.itemName);

test("test variable name", () => {
  expect(group1.itemName).toEqual("GROUP_name1");
  expect(group2.itemName).toEqual("GROUP_name2");
});

test("add users to groups (string)", () => {
  expect(group1.add("user1")).toEqual(true);
  expect(group1.add("user1")).toEqual(false);
  expect(group1.add("user2")).toEqual(true);
  expect(group2.add("1234")).toEqual(true);
});

test("add users to groups (number)", () => {
  expect(group2.add(1234)).toEqual(false);
  expect(group2.add(5678)).toEqual(true);
});

test("toggle users in groups (string)", () => {
  expect(group1.toggle("user1")).toEqual(false);
  expect(group1.toggle("user3")).toEqual(true);
  expect(group2.toggle("1234")).toEqual(false);
  expect(group2.toggle("1234")).toEqual(true);
});

test("toggle users in groups (number)", () => {
  expect(group2.toggle(1234)).toEqual(false);
  expect(group2.toggle(1234)).toEqual(true);
});

test("check final members", () => {
  expect(group1.members.sort()).toEqual(["user2", "user3"]);
  expect(group2.members.sort()).toEqual(["1234", "5678"]);
});

test("check if users are members (string)", () => {
  expect(group1.isMember("user1")).toEqual(false);
  expect(group1.isMember("user2")).toEqual(true);
  expect(group1.isMember("user3")).toEqual(true);
  expect(group1.isMember("user4")).toEqual(false);
  expect(group1.isMember("user")).toEqual(false);
  expect(group1.isMember("user11")).toEqual(false);
  expect(group1.isMember("User1")).toEqual(false);
  expect(group1.isMember("")).toEqual(false);

  expect(group2.isMember("1234")).toEqual(true);
  expect(group2.isMember("5678")).toEqual(true);
  expect(group2.isMember("")).toEqual(false);
  expect(group2.isMember("12345")).toEqual(false);
  expect(group2.isMember("123")).toEqual(false);
});

test("check if users are members (number)", () => {
  expect(group2.isMember(1234)).toEqual(true);
  expect(group2.isMember(5678)).toEqual(true);
  expect(group2.isMember(0)).toEqual(false);
  expect(group2.isMember(123)).toEqual(false);
  expect(group2.isMember(12345)).toEqual(false);
  expect(group2.isMember(1234.1)).toEqual(false);
  expect(group2.isMember(Infinity)).toEqual(false);
  expect(group2.isMember(NaN)).toEqual(false);
});

test("check if users are members (static helper method)", () => {
  expect(Group.isMember(group1, "user1")).toEqual(false);
  expect(Group.isMember(group1, "user2")).toEqual(true);
  expect(Group.isMember(group1, 1234)).toEqual(false);

  expect(Group.isMember([group1, group2], "user1")).toEqual(false);
  expect(Group.isMember([group1, group2], "user2")).toEqual(true);
  expect(Group.isMember([group1, group2], 1234)).toEqual(true);
});

test("test reset", () => {
  group1.reset();
  group2.reset();
  expect(group2.members).toEqual([]);
  expect(group2.members).toEqual([]);
});
