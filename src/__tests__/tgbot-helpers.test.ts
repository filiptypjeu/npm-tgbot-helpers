import TelegramBot = require("node-telegram-bot-api");
import { LocalStorage } from "node-localstorage";
import {
  properties,
  initBot,
  sendTo,
  toggleUserIdInGroup,
  addUserIdToGroup,
  variableToBool,
  variableToNumber,
  variableToList,
  variableToObject,
  variable,
  sendToGroup,
  getArguments,
  isInGroup,
  sendError,
  groupToUserInfo,
  userVariable,
  userIdFromCommand,
  commandFriendlyUserId,
  longNameFromUser,
  commandRegExp,
  IBotHelperCommand,
} from "../index";

jest.mock("node-telegram-bot-api", () => {
  return jest.fn().mockImplementation(() => {
    return {
      getMe: (): Promise<TelegramBot.User> => {
        return new Promise(resolve => resolve({ username: "botname" } as TelegramBot.User));
      },
      getChat: jest.fn(),
      sendMessage: jest.fn(),
    };
  });
});

initBot({
  telegramBotToken: "token",
  localStoragePath: "./src/__tests__/variables/",
  globalVariables: ["testVariable"],
  userVariables: ["var1", "var2"],
  errorGroup: "errorgroup",
});

const props = properties();
const bot = props.telegramBot;
const ls = props.localStorage;

test("properties", () => {
  // expect(bot).toEqual(expect.any(TelegramBot));
  expect(ls).toEqual(expect.any(LocalStorage));
  expect(props.globalVariables).toEqual(["testVariable"]);
  expect(props.userVariables).toEqual(["var1", "var2"]);
});

test("variable", () => {
  ls.setItem("v1", "123");
  expect(variable("v1")).toEqual("123");

  variable("v2", 1);
  expect(variable("v2")).toEqual("1");

  variable("v3", "string");
  expect(variable("v3")).toEqual("string");
});

test("userVariable", () => {
  expect(userVariable("test", "12345")).toEqual("test_12345");
  expect(userVariable("test", 54321)).toEqual("test_54321");
});

test("variableToNumber", () => {
  expect(variableToNumber("v1")).toEqual(123);
  expect(variableToNumber("v2")).toEqual(1);
  expect(variableToNumber("v3")).toEqual(0);
  expect(variableToNumber("v1", 5)).toEqual(123);
  expect(variableToNumber("v2", 5)).toEqual(1);
  expect(variableToNumber("v3", 5)).toEqual(5);
});

test("variableToBool", () => {
  expect(variableToBool("v1")).toEqual(false);
  expect(variableToBool("v2")).toEqual(true);
  expect(variableToBool("v3")).toEqual(false);
});

test("toggleUserIdInGroup", () => {
  variable("group", "");
  variable("errorgroup", "");
  expect(toggleUserIdInGroup("group", 11111)).toEqual(true);
  expect(toggleUserIdInGroup("group", 22222)).toEqual(true);
  expect(toggleUserIdInGroup("group", 1)).toEqual(true);
  expect(toggleUserIdInGroup("group", 1)).toEqual(false);
  expect(toggleUserIdInGroup("errorgroup", 33333)).toEqual(true);
});

test("addUserIdToGroup", () => {
  variable("newgroup", "");
  addUserIdToGroup("newgroup", 11111);
  addUserIdToGroup("newgroup", 22222);
  expect(isInGroup("newgroup", 11111)).toEqual(true);
  expect(isInGroup("newgroup", 22222)).toEqual(true);
  expect(isInGroup("newgroup", 33333)).toEqual(false);
});

test("variableToList", () => {
  expect(variableToList("group")).toEqual(["11111", "22222"]);
  expect(variableToList("errorgroup")).toEqual(["33333"]);
  expect(variableToList("notagroup")).toEqual([]);
});

test("variableToObject", () => {
  variable("obj", "");
  expect(variableToObject("obj")).toEqual({});

  variableToObject("obj", "num", 5);
  expect(variableToObject("obj")).toEqual({ num: 5 });

  variableToObject("obj", "stringg", "246");
  expect(variableToObject("obj")).toEqual({ num: 5, stringg: "246" });

  variableToObject("obj", "anotherObject", { value: 7.4 });
  expect(variableToObject("obj")).toEqual({ num: 5, stringg: "246", anotherObject: { value: 7.4 } });

  variableToObject("obj", "num");
  expect(variableToObject("obj")).toEqual({ stringg: "246", anotherObject: { value: 7.4 } });

  variableToObject("obj", "num");
  expect(variableToObject("obj")).toEqual({ stringg: "246", anotherObject: { value: 7.4 } });

  variableToObject("obj", "anotherObject", "123");
  expect(variableToObject("obj")).toEqual({ stringg: "246", anotherObject: "123" });
});

test("isInGroup", () => {
  expect(isInGroup("group", 11111)).toEqual(true);
  expect(isInGroup("group", 22222)).toEqual(true);
  expect(isInGroup("group", 33333)).toEqual(false);
  expect(isInGroup("errorgroup", 33333)).toEqual(true);
  expect(isInGroup("notagroup", 11111)).toEqual(false);
});

test("getArguments", () => {
  expect(getArguments("/test a b c")).toEqual(["a", "b", "c"]);
  expect(getArguments("test a b c")).toEqual(["a", "b", "c"]);
  expect(getArguments("/test\na     b   \n\n   \n c   \n  ")).toEqual(["a", "b", "c"]);
});

test("userIdFromCommand", () => {
  expect(userIdFromCommand("/command_12345")).toEqual(12345);
  expect(userIdFromCommand("/command_m12345")).toEqual(-12345);
  expect(userIdFromCommand("/command_12345m")).toEqual(undefined);
  expect(userIdFromCommand("/command_12345", "3")).toEqual(45);
  expect(userIdFromCommand("/commands_12345", "3", "4")).toEqual(-5);
  expect(userIdFromCommand("/commands_123.45")).toEqual(undefined);
});

test("commandFriendlyUserId", () => {
  expect(commandFriendlyUserId(12345)).toEqual("12345");
  expect(commandFriendlyUserId("12345")).toEqual("12345");
  expect(commandFriendlyUserId(-12345)).toEqual("m12345");
  expect(commandFriendlyUserId("-12345")).toEqual("m12345");
  expect(commandFriendlyUserId(-12345, "MINUS")).toEqual("MINUS12345");
  expect(commandFriendlyUserId("-12345", "MINUS")).toEqual("MINUS12345");
});

test("sendTo", () => {
  expect(sendTo(123, "message")).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(sendTo(123, "message", "HTML")).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: "HTML",
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(sendTo(123, "message", "Markdown")).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: "Markdown",
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(bot.sendMessage).toHaveBeenCalledTimes(3);
});

test("sendToGroup", () => {
  expect(sendToGroup("group", "message")).rejects.toThrowError();

  expect(bot.sendMessage).toHaveBeenCalledWith("11111", "message", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });
  expect(bot.sendMessage).toHaveBeenCalledWith("22222", "message", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(bot.sendMessage).toHaveBeenCalledTimes(5);
});

test("sendError", () => {
  expect(sendError("Error")).rejects.toThrowError();

  expect(bot.sendMessage).toHaveBeenLastCalledWith("33333", "Error", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(bot.sendMessage).toHaveBeenCalledTimes(6);
});

test("sendTo SendMessageOptions", () => {
  expect(
    sendTo(123, "message", { parse_mode: "Markdown", disable_web_page_preview: true, disable_notification: true })
  ).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: "Markdown",
    disable_notification: true,
    disable_web_page_preview: true,
  });

  expect(bot.sendMessage).toHaveBeenCalledTimes(7);
});

test("sendTo sanitize HTML", () => {
  expect(sendTo(123, "<b>text</b><<>&text<i>texxxttt</i>&", "HTML", true)).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenLastCalledWith(123, "<b>text</b>&lt;&lt;&gt;&amp;text<i>texxxttt</i>&amp;", {
    parse_mode: "HTML",
    disable_notification: true,
    disable_web_page_preview: false,
  });

  expect(bot.sendMessage).toHaveBeenCalledTimes(8);
});

test("groupToUserInfo", () => {
  expect(groupToUserInfo("group")).rejects.toThrowError();

  expect(bot.getChat).toHaveBeenCalledWith("11111");
  expect(bot.getChat).toHaveBeenCalledWith("22222");

  expect(bot.getChat).toHaveBeenCalledTimes(2);
});

test("longNameFromUser with username", () => {
  const u = {
    username: "USERNAME",
  } as TelegramBot.User;

  expect(longNameFromUser(u)).toEqual("USERNAME");

  u.first_name = "FIRSTNAME";
  expect(longNameFromUser(u)).toEqual("FIRSTNAME (USERNAME)");

  u.last_name = "LASTNAME";
  expect(longNameFromUser(u)).toEqual("FIRSTNAME LASTNAME (USERNAME)");
});

test("longNameFromUser no username", () => {
  const u = {
    first_name: "FIRSTNAME",
  } as TelegramBot.User;

  expect(longNameFromUser(u)).toEqual("FIRSTNAME");

  u.last_name = "LASTNAME";
  expect(longNameFromUser(u)).toEqual("FIRSTNAME LASTNAME");
});

test("longNameFromUser with title", () => {
  const u = {
    title: "TITLE",
    first_name: "FIRSTNAME",
    last_name: "LASTNAME",
    username: "USERNAME",
  } as TelegramBot.Chat;

  expect(longNameFromUser(u)).toEqual("TITLE");
});

test("regexp", () => {
  const cmd: IBotHelperCommand = {
    command: "cmd",
    callback: () => {},
  };

  const regexp = commandRegExp(cmd, "botname");

  let res = true;

  [
    "/cmd",
    "/cmd text",
    "/cmd\ntext",
    "/cmd,text",
    "/cmd.text",
    "/cmd&text",
    "/cmd#text",
    "/cmd$text",
    "/cmd'text",
    '/cmd"text',
    "/cmd@botname",
    "/cmd@botname text",
    "/cmd@botname\ntext",
    "/cmd@botname,text",
    "/cmd@botname.text",
    "/cmd@botname&text",
    "/cmd@botname#text",
    "/cmd@botname$text",
    "/cmd@botname'text",
    '/cmd@botname"text',
    "/cmd@botname@",
  ].forEach(s => {
    const b = regexp.test(s);
    if (!b) {
      console.log(s);
    }
    res = res && b;
  });
  expect(res).toBe(true);

  ["/cmda", "/cmdA", "/cmd0", "/cmd_", "/cmd@", "/cmd@notbotname", "cmd", "text /cmd", " /cmd"].forEach(s => {
    const b = !regexp.test(s);
    if (!b) {
      console.log(s);
    }
    res = res && b;
  });
  expect(res).toBe(true);
});

test("regexp matchBeginningOnly", () => {
  const cmd: IBotHelperCommand = {
    command: "cmd",
    callback: () => {},
    matchBeginningOnly: true,
  };

  const regexp = commandRegExp(cmd, "botname");

  let res = true;

  [
    "/cmd",
    "/cmd text",
    "/cmd\ntext",
    "/cmd,text",
    "/cmd.text",
    "/cmd&text",
    "/cmd#text",
    "/cmd$text",
    "/cmd'text",
    '/cmd"text',
    "/cmd@botname",
    "/cmd@botname text",
    "/cmd@botname\ntext",
    "/cmd@botname,text",
    "/cmd@botname.text",
    "/cmd@botname&text",
    "/cmd@botname#text",
    "/cmd@botname$text",
    "/cmd@botname'text",
    '/cmd@botname"text',
    "/cmd@botname@",
    "/cmda",
    "/cmdA",
    "/cmd0",
    "/cmd_",
  ].forEach(s => {
    const b = regexp.test(s);
    if (!b) {
      console.log(s);
    }
    res = res && b;
  });
  expect(res).toBe(true);

  ["/cmd@", "/cmd@notbotname", "cmd", "text /cmd", " /cmd"].forEach(s => {
    const b = !regexp.test(s);
    if (!b) {
      console.log(s);
    }
    res = res && b;
  });
  expect(res).toBe(true);
});
