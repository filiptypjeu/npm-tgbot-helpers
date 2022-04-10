import { LocalStorage } from "node-localstorage";
import { Group } from "../Group";

const ls = new LocalStorage("./src/__tests__/variables/");

afterAll(() => ls.clear());

describe("add and toggle", () => {
  const A = new Group("A", ls);
  const B = new Group("B", ls);

  beforeAll(() => {
    A.clear();
    B.clear();
  });

  test("add users to group (string)", () => {
    expect(A.add("user1")).toEqual(true);
    expect(A.add("user1")).toEqual(false);
    expect(A.add("user2")).toEqual(true);
    expect(B.add("1234")).toEqual(true);
  });

  test("add users to group (number)", () => {
    expect(B.add(1234)).toEqual(false);
    expect(B.add(5678)).toEqual(true);
  });

  test("toggle users in groups (string)", () => {
    expect(A.toggle("user1")).toEqual(false);
    expect(A.toggle("user3")).toEqual(true);
    expect(B.toggle("1234")).toEqual(false);
    expect(B.toggle("1234")).toEqual(true);
  });

  test("toggle users in groups (number)", () => {
    expect(B.toggle(1234)).toEqual(false);
    expect(B.toggle(1234)).toEqual(true);
  });

  test("check final members", () => {
    expect(A.members.sort()).toEqual(["user2", "user3"]);
    expect(B.members.sort()).toEqual(["1234", "5678"]);
  });

  test("test clear", () => {
    A.clear();
    B.clear();
    expect(A.members).toEqual([]);
    expect(B.members).toEqual([]);
  });
});

describe("check membership", () => {
  const A = new Group("a", ls);
  const B = new Group("b", ls);

  beforeAll(() => {
    A.clear();
    B.clear();
  });

  beforeEach(() => {
    ["user1", "user2"].forEach(u => A.add(u));
    [1234, 5678].forEach(u => B.add(u));
  });

  test("check if users are members (string)", () => {
    expect(A.isMember("user1")).toEqual(true);
    expect(A.isMember("user2")).toEqual(true);
    expect(A.isMember("user3")).toEqual(false);
    expect(A.isMember("user")).toEqual(false);
    expect(A.isMember("User1")).toEqual(false);
    expect(A.isMember("")).toEqual(false);

    expect(B.isMember("1234")).toEqual(true);
    expect(B.isMember("5678")).toEqual(true);
    expect(B.isMember("")).toEqual(false);
    expect(B.isMember("12345")).toEqual(false);
    expect(B.isMember("123")).toEqual(false);
  });

  test("check if users are members (number)", () => {
    expect(B.isMember(1234)).toEqual(true);
    expect(B.isMember(5678)).toEqual(true);
    expect(B.isMember(0)).toEqual(false);
    expect(B.isMember(123)).toEqual(false);
    expect(B.isMember(12345)).toEqual(false);
    expect(B.isMember(1234.1)).toEqual(false);
    expect(B.isMember(Infinity)).toEqual(false);
    expect(B.isMember(NaN)).toEqual(false);
  });

  test("check if users are members (static helper method)", () => {
    expect(Group.isMember(A, "user1")).toEqual(true);
    expect(Group.isMember(A, "user2")).toEqual(true);
    expect(Group.isMember(A, "user3")).toEqual(false);
    expect(Group.isMember(A, 1234)).toEqual(false);

    expect(Group.isMember([A, B], "user1")).toEqual(true);
    expect(Group.isMember([A, B], "user2")).toEqual(true);
    expect(Group.isMember([A, B], "user3")).toEqual(false);
    expect(Group.isMember([A, B], 1234)).toEqual(true);
  });
});
