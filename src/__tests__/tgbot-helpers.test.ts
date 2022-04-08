import TelegramBot = require("node-telegram-bot-api");
import { LocalStorage } from "node-localstorage";
import TGBotWrapper, { ICommand } from "../index";
import Group from "../Group";

const sendMessageMock = jest.fn();

jest.mock("node-telegram-bot-api", () => {
  return jest.fn().mockImplementation(() => {
    return {
      TelegramBot: jest.fn(),
      getMe: (): Promise<TelegramBot.User> => {
        return new Promise(resolve => resolve({ username: "botname" } as TelegramBot.User));
      },
      getChat: jest.fn(),
      sendMessage: sendMessageMock,
      onText: jest.fn(),
      startPolling: jest.fn(),
      isPolling: jest.fn(),
      on: jest.fn(),
    };
  });
});

const ls = new LocalStorage("./src/__tests__/variables/");
const group = new Group("mygroup", ls).clear();
group.add(11111);
group.add(22222);
const sudoGroup = new Group("admin", ls).clear();
sudoGroup.add(33333);

afterAll(() => ls.clear());

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
  },
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

test("handleMessage", () => {
  const msg = { text: "/command_12345", entities: [{ type: "bot_command", offset: 0, length: 14 }] } as TelegramBot.Message;

  expect(wrapper.handleMessage(msg)).toEqual({
    command: "/command_12345",
    commandBase: "command",
    commandSuffix: "12345",
    arguments: [],
  });

  msg.text = "/command_12345 more text";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.handleMessage(msg)).toEqual({
    command: "/command_12345",
    commandBase: "command",
    commandSuffix: "12345",
    text: "more text",
    arguments: ["more", "text"],
  });

  msg.text = "/command_SOMETHING12345@bot some text   with     sp\naces";
  msg.entities![0]!.length = msg.text.split(" ")[0].length;
  expect(wrapper.handleMessage(msg)).toEqual({
    command: "/command_SOMETHING12345@bot",
    commandBase: "command",
    commandSuffix: "SOMETHING12345",
    commandBotName: "bot",
    text: "some text   with     sp\naces",
    arguments: ["some", "text", "with", "sp"],
  });

  msg.entities = undefined;
  expect(wrapper.handleMessage(msg)).toEqual({
    text: "/command_SOMETHING12345@bot some text   with     sp\naces",
    arguments: [],
  });
});

test("commandify", () => {
  expect(wrapper.commandify(12345)).toEqual("12345");
  expect(wrapper.commandify("12345")).toEqual("12345");
  expect(wrapper.commandify(-12345)).toEqual("m12345");
  expect(wrapper.commandify("-12345")).toEqual("m12345");
});

test("decommandify", () => {
  expect(wrapper.decommandify("12345")).toEqual(12345);
  expect(wrapper.decommandify("-12345")).toEqual(-12345);
  expect(wrapper.decommandify("m12345")).toEqual(-12345);
  expect(wrapper.decommandify("12.5")).toEqual(undefined);
  expect(wrapper.decommandify("123m45")).toEqual(undefined);
  expect(wrapper.decommandify("n12345")).toEqual(undefined);
});

describe("send messages", () => {
  beforeEach(() => sendMessageMock.mockClear());

  test("sendTo", () => {
    expect(wrapper.sendTo(123, "message"));
    expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
      parse_mode: "HTML",
      disable_notification: false,
      disable_web_page_preview: false,
    });

    expect(wrapper.sendTo(123, "message", "Markdown"));
    expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
      parse_mode: "Markdown",
      disable_notification: false,
      disable_web_page_preview: false,
    });

    expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("sendToGroup", () => {
    expect(wrapper.sendToGroup(group, "message"));

    expect(wrapper.bot.sendMessage).toHaveBeenCalledWith("11111", "message", {
      parse_mode: "HTML",
      disable_notification: false,
      disable_web_page_preview: false,
    });
    expect(wrapper.bot.sendMessage).toHaveBeenCalledWith("22222", "message", {
      parse_mode: "HTML",
      disable_notification: false,
      disable_web_page_preview: false,
    });

    expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("sendError", () => {
    expect(wrapper.sendError("Error"));

    expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith("33333", "Error", {
      parse_mode: "HTML",
      disable_notification: false,
      disable_web_page_preview: false,
    });

    expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  test("sendTo SendMessageOptions", () => {
    expect(
      wrapper.sendTo(123, "message", { parse_mode: "Markdown", disable_web_page_preview: true, disable_notification: true })
    );
    expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "message", {
      parse_mode: "Markdown",
      disable_notification: true,
      disable_web_page_preview: true,
    });

    expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  test("sendTo sanitize HTML", () => {
    expect(wrapper.sendTo(123, "<b>text</b><<>&text<i>texxxttt</i>&", "HTML", true));
    expect(wrapper.bot.sendMessage).toHaveBeenLastCalledWith(123, "<b>text</b>&lt;&lt;&gt;&amp;text<i>texxxttt</i>&amp;", {
      parse_mode: "HTML",
      disable_notification: true,
      disable_web_page_preview: false,
    });

    expect(wrapper.bot.sendMessage).toHaveBeenCalledTimes(1);
  });
});

test("groupToUserInfo", () => {
  expect(wrapper.groupToUserInfo(group)).rejects.toThrowError();

  expect(wrapper.bot.getChat).toHaveBeenCalledWith("11111");
  expect(wrapper.bot.getChat).toHaveBeenCalledWith("22222");

  expect(wrapper.bot.getChat).toHaveBeenCalledTimes(2);
});

test("chatInfo with user", () => {
  const u = {
    first_name: "FIRSTNAME",
    is_bot: false,
    id: 1234,
  } as TelegramBot.User;

  expect(wrapper.chatInfo(u)).toEqual("FIRSTNAME");
  expect(wrapper.chatInfo(u, true, true, true)).toEqual("<b>FIRSTNAME</b>");

  u.username = "USERNAME";
  expect(wrapper.chatInfo(u)).toEqual("FIRSTNAME @USERNAME");
  expect(wrapper.chatInfo(u, true, true, true)).toEqual("<b>FIRSTNAME</b> <i>@USERNAME</i>");

  u.last_name = "LASTNAME";
  u.is_bot = true;
  expect(wrapper.chatInfo(u)).toEqual("FIRSTNAME LASTNAME @USERNAME");
  expect(wrapper.chatInfo(u, true, true, true)).toEqual("<b>FIRSTNAME LASTNAME</b> <i>@USERNAME</i> (BOT)");
});

test("chatInfo with private chat", () => {
  const c = {
    id: 4321,
    first_name: "FIRSTNAME",
    last_name: "LASTNAME",
    username: "USERNAME",
    type: "private",
  } as TelegramBot.Chat;

  expect(wrapper.chatInfo(c)).toEqual("FIRSTNAME LASTNAME @USERNAME");
  expect(wrapper.chatInfo(c, true, true)).toEqual("<b>FIRSTNAME LASTNAME</b> <i>@USERNAME</i>");
  expect(wrapper.chatInfo(c, true, true, true)).toEqual("[private]");
});

test("chatInfo with group chat", () => {
  const c = {
    id: 4321,
    title: "TITLE",
    first_name: "FIRSTNAME",
    last_name: "LASTNAME",
    username: "USERNAME",
    type: "supergroup",
  } as TelegramBot.Chat;

  expect(wrapper.chatInfo(c)).toEqual("TITLE [supergroup]");
  expect(wrapper.chatInfo(c, true, true, true)).toEqual("<b>TITLE</b> [supergroup]");

  c.invite_link = "LINK";
  expect(wrapper.chatInfo(c)).toEqual("TITLE [supergroup]");
  expect(wrapper.chatInfo(c, true, true, true)).toEqual("<b>TITLE</b> [supergroup] <i>LINK</i>");
});

test("regexp", () => {
  const cmd: ICommand = {
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
  const cmd: ICommand = {
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
