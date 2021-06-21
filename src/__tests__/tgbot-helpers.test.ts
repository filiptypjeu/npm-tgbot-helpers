import TelegramBot = require("node-telegram-bot-api");
import { LocalStorage } from "node-localstorage";
import TGBotWrapper, { IBotHelperCommand } from "../index";
import { Group } from "../Group";

jest.mock("node-telegram-bot-api", () => {
  return jest.fn().mockImplementation(() => {
    return {
      TelegramBot: jest.fn(),
      getMe: (): Promise<TelegramBot.User> => {
        return new Promise(resolve => resolve({ username: "botname" } as TelegramBot.User));
      },
      getChat: jest.fn(),
      sendMessage: jest.fn(),
      onText: jest.fn(),
      startPolling: jest.fn(),
      isPolling: jest.fn(),
      on: jest.fn(),
    };
  });
});

const ls = new LocalStorage("./src/__tests__/variables/");
const group = new Group("mygroup", ls).reset();
group.add(11111);
group.add(22222);
const sudoGroup = new Group("admin", ls).reset();
sudoGroup.add(33333);

const wrapper = new TGBotWrapper({
  telegramBot: new TelegramBot("token"),
  localStorage: ls,
  sudoGroup,
  defaultCommands: {
    start: {
      greeting: "hello",
    },
    var: "var",
    init: "init",
  },
});

wrapper.addCustomCommands([
  {
    command: "mycommand",
    callback: () => {},
  },
  {
    command: "myothercommand",
    group: sudoGroup,
    callback: () => {},
  }
]);

test("commands and commandsByGroup", () => {
  expect(wrapper.commands).toHaveLength(5);
  expect(wrapper.bot.onText).toHaveBeenCalledTimes(5);

  const c = wrapper.commandsByGroup();
  expect(c.get(undefined)).toHaveLength(3);
  expect(c.get(sudoGroup)).toHaveLength(2);
});

test("username", async () => {
  expect((await wrapper.thisUser).username).toEqual("botname");
});

test("getArguments", () => {
  expect(wrapper.getArguments("/test a b c")).toEqual(["a", "b", "c"]);
  expect(wrapper.getArguments("test a b c")).toEqual(["a", "b", "c"]);
  expect(wrapper.getArguments("/test\na     b   \n\n   \n c   \n  ")).toEqual(["a", "b", "c"]);
});

test("userIdFromCommand and getCommand", () => {
  const msg = { text: "/command_12345", entities: [{ type: "bot_command", offset: 0, length: 14 }] } as TelegramBot.Message;

  expect(wrapper.userIdFromCommand(msg)).toEqual(12345);

  msg.text = "/command_12345 more text";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg)).toEqual(12345);

  msg.text = "/command_12345@bot some text";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg)).toEqual(12345);

  msg.text = "/command_m12345@bot some text";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg)).toEqual(-12345);

  msg.text = "/command_12345";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg, "3", "4")).toEqual(-5);

  msg.text = "/commandAB12345@bot some text";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg, "A", "B")).toEqual(-12345);

  msg.text = "/commandA12345@bot some text";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg)).toEqual(undefined);

  msg.text = "/command_abc";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg)).toEqual(undefined);

  msg.text = "/command_12.345";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.userIdFromCommand(msg)).toEqual(undefined);

  msg.text = "/command_12345";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  msg.entities![0]!.offset = 1;
  expect(wrapper.userIdFromCommand(msg)).toEqual(undefined);
});

test("commandFriendlyUserId", () => {
  expect(wrapper.commandFriendlyUserId(12345)).toEqual("12345");
  expect(wrapper.commandFriendlyUserId("12345")).toEqual("12345");
  expect(wrapper.commandFriendlyUserId(-12345)).toEqual("m12345");
  expect(wrapper.commandFriendlyUserId("-12345")).toEqual("m12345");
  expect(wrapper.commandFriendlyUserId(-12345, "MINUS")).toEqual("MINUS12345");
  expect(wrapper.commandFriendlyUserId("-12345", "MINUS")).toEqual("MINUS12345");
});

test("sendTo", () => {
  expect(wrapper.sendTo(123, "message")).rejects.toThrowError();
  expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(wrapper.sendTo(123, "message", "HTML")).rejects.toThrowError();
  expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: "HTML",
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(wrapper.sendTo(123, "message", "Markdown")).rejects.toThrowError();
  expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: "Markdown",
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(4);
});

test("sendToGroup", () => {
  expect(wrapper.sendToGroup(group, "message")).rejects.toThrowError();

  expect(wrapper.bot.sendMessage).toHaveBeenCalledWith("11111", "message", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });
  expect(wrapper.bot.sendMessage).toHaveBeenCalledWith("22222", "message", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(6);
});

test("sendError", () => {
  expect(wrapper.sendError("Error")).rejects.toThrowError();

  expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith("33333", "Error", {
    parse_mode: undefined,
    disable_notification: false,
    disable_web_page_preview: false,
  });

  expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(7);
});

test("sendTo SendMessageOptions", () => {
  expect(
    wrapper.sendTo(123, "message", { parse_mode: "Markdown", disable_web_page_preview: true, disable_notification: true })
  ).rejects.toThrowError();
  expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
    parse_mode: "Markdown",
    disable_notification: true,
    disable_web_page_preview: true,
  });

  expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(8);
});

test("sendTo sanitize HTML", () => {
  expect(wrapper.sendTo(123, "<b>text</b><<>&text<i>texxxttt</i>&", "HTML", true)).rejects.toThrowError();
  expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "<b>text</b>&lt;&lt;&gt;&amp;text<i>texxxttt</i>&amp;", {
    parse_mode: "HTML",
    disable_notification: true,
    disable_web_page_preview: false,
  });

  expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(9);
});

test("groupToUserInfo", () => {
  expect(wrapper.groupToUserInfo(group)).rejects.toThrowError();

  expect(wrapper.bot.getChat).toHaveBeenCalledWith("11111");
  expect(wrapper.bot.getChat).toHaveBeenCalledWith("22222");

  expect(wrapper.bot.getChat).toHaveBeenCalledTimes(2);
});

test("longNameFromUser with username", () => {
  const u = {
    username: "USERNAME",
  } as TelegramBot.User;

  expect(wrapper.longNameFromUser(u)).toEqual("@USERNAME");

  u.first_name = "FIRSTNAME";
  expect(wrapper.longNameFromUser(u)).toEqual("FIRSTNAME @USERNAME");

  u.last_name = "LASTNAME";
  expect(wrapper.longNameFromUser(u)).toEqual("FIRSTNAME LASTNAME @USERNAME");
});

test("longNameFromUser no username", () => {
  const u = {
    first_name: "FIRSTNAME",
  } as TelegramBot.User;

  expect(wrapper.longNameFromUser(u)).toEqual("FIRSTNAME");

  u.last_name = "LASTNAME";
  expect(wrapper.longNameFromUser(u)).toEqual("FIRSTNAME LASTNAME");
});

test("longNameFromUser with title", () => {
  const u = {
    title: "TITLE",
    first_name: "FIRSTNAME",
    last_name: "LASTNAME",
    username: "USERNAME",
  } as TelegramBot.Chat;

  expect(wrapper.longNameFromUser(u)).toEqual("TITLE");
});

test("regexp", () => {
  const cmd: IBotHelperCommand = {
    command: "cmd",
    callback: () => {},
  };

  const regexp = wrapper.commandRegExp(cmd, "botname");

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

  const regexp = wrapper.commandRegExp(cmd, "botname");

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
