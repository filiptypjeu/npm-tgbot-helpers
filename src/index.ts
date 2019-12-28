import fs from "fs";
import { LocalStorage } from "node-localstorage";
import TelegramBot, { Message, ParseMode } from "node-telegram-bot-api";
import os from "os";
import readLastLines from "read-last-lines";

/**
 * @todo
 * - Command allowed for multiple groups?
 * - Add support for command@BotName
 * - Re-add groups variable for group existense checks
 * - Fix "hide"
 */

export interface IBotHelperInit {
  telegramBotToken: string;
  telegramBotName?: string;
  localStoragePath: string;
  globalVariables?: string[];
  userVariables?: string[];
  commands?: IBotHelperCommand[];
  errorGroup?: string;
  commandLogPath?: string;
  whenOnline?: () => void;
}

export interface IBotHelperProps {
  telegramBot: TelegramBot;
  localStorage: LocalStorage;
  globalVariables: string[];
  userVariables: string[];
  commands: IBotHelperCommand[];
}

export interface IBotHelperCommand {
  command: string;
  regexp?: RegExp;
  group?: string;
  privateOnly?: boolean;
  matchBeginningOnly?: boolean;
  hide?: boolean;
  description?: string;
  callback: (msg: Message) => void;
}

let bot: TelegramBot;
let ls: LocalStorage;

const startTime = new Date();
const deactivatedCommands: string = "TGBOT_deactivatedcommands";
let commands: IBotHelperCommand[] = [];
let errorGroup: string = "";
let uVars: string[] = [];
let gVars: string[] = [];
let commandLogPath = "./logs/commands.log";

const commandRegExp = (c: IBotHelperCommand): RegExp => {
  return c.matchBeginningOnly ? new RegExp(`^/${c.command}`) : new RegExp(`^/${c.command}\\b`);
};

/**
 * @param {number | Date} value is the value based on which the duration should be calculated on. Can either be the number of milliseconds of the duration, or a Date object that specifies the start time.
 *
 * @returns {string} the duration in a 'days hours minutes seconds' format.
 */
const getDurationString = (value: number | Date) => {
  let v: number;
  if (typeof value === "number") {
    v = value;
  } else {
    v = new Date().valueOf() - value.valueOf();
  }
  const d = Math.floor(v / (3600000 * 24));
  const h = Math.floor((v - d * 3600000 * 24) / 3600000);
  const m = Math.floor((v - d * 3600000 * 24 - h * 3600000) / 60000);
  const s = Math.floor((v - d * 3600000 * 24 - h * 3600000 - m * 60000) / 1000);

  return `${d} day${d === 1 ? "" : "s"} ${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"} ${s} second${
    s === 1 ? "" : "s"
  }`;
};

/**
 * Orders the commnads by the grupup that can use them.
 *
 * @param {IBotHelperCommand} cmds Commands to order.
 *
 * @returns A Map<string, IBotHelperCommand> that maps group name to commands.
 */
const groupByGroup = (cmds: IBotHelperCommand[]) => {
  const m = new Map<string, IBotHelperCommand[]>();
  cmds.forEach(cmd => {
    const g = cmd.group || "";
    m.set(g, (m.get(g) || []).concat(cmd));
  });

  return m;
};

/**
 * Initializes a Telegram Bot.
 *
 * @param {IBotHelperInit} initWith Parameters to initialize the bot with.
 */
export const initBot = (initWith: IBotHelperInit): TelegramBot => {
  bot = new TelegramBot(initWith.telegramBotToken, { polling: true });
  ls = new LocalStorage(initWith.localStoragePath);

  if (initWith.errorGroup) {
    errorGroup = initWith.errorGroup;
  }
  if (initWith.globalVariables) {
    gVars = initWith.globalVariables;
  }
  if (initWith.userVariables) {
    uVars = initWith.userVariables;
  }
  if (initWith.commandLogPath) {
    commandLogPath = initWith.commandLogPath;
  }
  if (initWith.commands) {
    commands = initWith.commands;
  }

  commands.forEach(async c => {
    bot.onText(commandRegExp(c), msg => {
      fs.appendFile(commandLogPath, `${Date.now()};/${c.command};${msg.from!.id};${msg.from!.username}\n`, e => {
        if (e) {
          sendError(e);
        }
      });

      console.log(`User ${msg.from!.id} used command /${c.command}.`);

      if (!isInGroup(errorGroup, msg.chat.id) && isInGroup(deactivatedCommands, `/${c}`)) {
        sendTo(msg.chat.id, "This command has been deactivated.");
        console.log(`Command is deactivated.`);
        return;
      }

      if (c.group && !isInGroup(c.group, msg.chat.id)) {
        sendTo(msg.chat.id, "You dont have access to this command.");
        console.log(`User not in group ${c.group}.`);
        return;
      }

      if (c.privateOnly && msg.chat.type !== "private") {
        sendTo(msg.chat.id, "The command can only be used in a private chat.");
        console.log(`Not in private chat.`);
        return;
      }

      console.log("Callback called.");
      return c.callback(msg);
    });
  });

  console.log(
    `Telegram bot initialized with ${commands.length} commands, ${gVars.length} global variables and ${uVars.length} user variables.`
  );

  if (initWith.whenOnline) {
    initWith.whenOnline();
  }

  return bot;
};

/**
 * Returns some Telegram Bot properties.
 */
export const properties = (): IBotHelperProps => {
  const p: IBotHelperProps = {
    commands,
    globalVariables: gVars,
    localStorage: ls,
    telegramBot: bot,
    userVariables: uVars,
  };
  return p;
};

export const msgInfoToString = (msg: TelegramBot.Message): string[] => {
  return [
    `Username: ${msg.from!.username}`,
    `First name: ${msg.from!.first_name}`,
    `Last name: ${msg.from!.last_name}`,
    `Is bot: ${msg.from!.is_bot}`,
    `User ID: ${msg.from!.id}`,
    `Chat type: ${msg.chat.type}`,
  ];
};

export const getArguments = (text?: string): string[] => {
  if (text) {
    return text
      .split("\n")
      .join(" ")
      .split(" ")
      .filter(s => s)
      .slice(1);
  }
  return [];
};

export const isInGroup = (groupName: string, userId: number | string) => {
  return variableToList(groupName).includes(userId.toString());
};

export const sendTo = async (userId: number | string, text: string, parseMode?: ParseMode) => {
  bot.sendMessage(userId, text, { parse_mode: parseMode }).catch(e => {
    if (e.code === "ETELEGRAM") {
      sendError(
        `Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`
      );
    } else {
      console.log(e.code);
      console.log(e.response.body);
    }
  });
};

export const sendToGroup = async (groupName: string, text: string, parseMode?: ParseMode) => {
  return Promise.all(variableToList(groupName).map(id => sendTo(id, text, parseMode)));
};

export const sendError = async (e: any) => {
  console.error(e);
  return sendToGroup(errorGroup, e.toString() ? e.toString().slice(0, 3000) : "Error...");
};

export const variable = (variableName: string, value?: string | number) => {
  if (value === undefined) {
    const s = ls.getItem(variableName);
    return s ? s : "";
  }
  return ls.setItem(variableName, value.toString());
};

export const variableToNumber = (variableName: string, defaultValue: number = 0): number => {
  const s = ls.getItem(variableName);
  return Number(s) ? Number(s) : defaultValue;
};

export const variableToBool = (variableName: string): boolean => {
  return ls.getItem(variableName) === "1";
};

export const variableToList = (variableName: string): string[] => {
  const s = variable(variableName);
  return s
    ? s
        .trim()
        .split(" ")
        .join("\n")
        .split("\n")
        .filter(v => v)
    : [];
};

export const userVariable = (variableName: string, userId: string | number) => {
  return variableName + "_" + userId;
};

export const groupToUserInfo = async (variableName: string, extraInfo?: string[]) => {
  const userIds = variableToList(variableName);

  if (userIds.length > 0) {
    return await Promise.all(
      userIds.map(async (n, i) => {
        return await bot.getChat(n).then(chat => {
          return `${chat.first_name} ${chat.last_name}, ${chat.username} (ID: ${n}${
            extraInfo ? `, ${extraInfo[i] ? extraInfo[i] : "no info"}` : ""
          })`;
        });
      })
    );
  } else {
    return [];
  }
};

export const toggleUserIdInGroup = (groupName: string, userId: number | string) => {
  const userIds = variableToList(groupName);

  if (userIds.includes(userId.toString())) {
    variable(groupName, userIds.filter(id => id !== userId.toString()).join("\n"));
    return false;
  }

  userIds.push(userId.toString());
  variable(groupName, userIds.join("\n"));
  return true;
};

export const defaultCommandUptime = async (msg: TelegramBot.Message) => {
  return Promise.all([getDurationString(startTime), getDurationString(os.uptime() * 1000)]).then(([s1, s2]) =>
    sendTo(msg.chat.id, `Bot uptime: ${s1}\nOS uptime: ${s2}`)
  );
};

export const defaultCommandIP = async (msg: TelegramBot.Message) => {
  const ifaces = os.networkInterfaces();
  let ips = "";

  Object.keys(ifaces).forEach(ifname => {
    let alias = 0;
    ifaces[ifname].forEach(iface => {
      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (iface.family !== "IPv4" || iface.internal) {
        return;
      }

      alias ? (ips += `${ifname}:${alias} ${iface.address}\n`) : (ips += `${ifname} ${iface.address}\n`);

      ++alias;
    });
  });

  return sendTo(msg.chat.id, ips ? ips : "No IP addresses found.");
};

export const defaultCommandCommands = (msg: TelegramBot.Message) => {
  groupByGroup(commands).forEach((cmds, group) => {
    if (!group || isInGroup(group, msg.chat.id)) {
      sendTo(
        msg.chat.id,
        `<b>Commands accessible to ${group ? `group ${group}` : "everybody"}:</b>\n` +
          cmds
            .map(cmd => `/${cmd.command}${cmd.privateOnly ? "*" : ""}`)
            .sort()
            .join("\n"),
        "HTML"
      );
    }
  });
};

export const defaultCommandHelp = async (msg: TelegramBot.Message) => {
  return sendTo(
    msg.chat.id,
    commands
      .filter(cmd => (cmd.group ? isInGroup(cmd.group, msg.chat.id) : !cmd.hide))
      .map(
        cmd =>
          `/${cmd.command}${cmd.privateOnly ? "*" : ""}:  ${
            cmd.description ? cmd.description : "No description available."
          }`
      )
      .sort()
      .join("\n\n"),
    "HTML"
  );
};

export const defaultCommandKill = (msg: TelegramBot.Message) => {
  sendTo(msg.chat.id, "Good bye!");
  setTimeout(() => {
    return process.exit();
  }, 3000);
};

export const defaultCommandVar = async (msg: TelegramBot.Message) => {
  const args = getArguments(msg.text);

  if (!args[0]) {
    return sendTo(
      msg.chat.id,
      "<b>Available global variables:</b>\n" +
        gVars
          .map((v, i) => {
            const value = variable(v);
            return `${i} ${v} ${value ? value : "null"}`;
          })
          .join("\n"),
      "HTML"
    );
  } else if (!args[1]) {
    return sendTo(msg.chat.id, "Please provide two arguments.");
  } else if (Number(args[0]) >= 0 && Number(args[0]) < gVars.length) {
    variable(
      gVars[Number(args[0])],
      args
        .slice(1)
        .join(" ")
        .trim()
    );
    return sendTo(
      msg.chat.id,
      `Global variable set: <b>${gVars[Number(args[0])]} = ${variable(gVars[Number(args[0])])}</b>`,
      "HTML"
    );
  } else {
    return sendTo(msg.chat.id, `Global variable ${args[0]} does not exist.`);
  }
};

export const defaultCommandAdmin = (groupName: string) => {
  return (msg: TelegramBot.Message) => {
    if (getArguments(msg.text)[0] === undefined) {
      sendTo(msg.chat.id, `Use "/admin your message here" to send a message to the administrator(s).`);
    } else {
      sendToGroup(
        groupName,
        `<b>Message from user:</b>\n - ` + msgInfoToString(msg).join("\n - ") + `\n - Text: ${msg.text}`,
        "HTML"
      );
    }
  };
};

export const defaultCommandLog = (logPath: string) => {
  return async (msg: TelegramBot.Message) => {
    return readLastLines
      .read(logPath, Number(getArguments(msg.text)[0]) < 50 ? Number(getArguments(msg.text)[0]) : 50)
      .then(s => sendTo(msg.chat.id, s ? s : `File ${logPath} is empty.`))
      .catch(e => sendError(e));
  };
};

export const defaultCommandInit = (groupToInitTo: string) => {
  return (msg: TelegramBot.Message) => {
    const userIds = variableToList(groupToInitTo);
    if (!userIds.length) {
      toggleUserIdInGroup(groupToInitTo, msg.chat.id);
    }
  };
};

export const defaultCommandDeactivate = async (msg: TelegramBot.Message) => {
  const arg = getArguments(msg.text)[0];
  const deactivated = variableToList(deactivatedCommands);
  let s = "";

  if (!arg) {
    s = "<b>Deactivated commands:</b>\n" + deactivated.map((v, i) => `${i} ${v}`).join("\n");
  } else if (Number(arg) < deactivated.length) {
    toggleUserIdInGroup(deactivatedCommands, deactivated[Number(arg)]);
    s = `Command ${deactivated[Number(arg)]} has been reactivated!`;
  } else if (arg.indexOf("/") !== 0) {
    s = `Number not correct, or command not starting with '/'.`;
  } else {
    toggleUserIdInGroup(deactivatedCommands, arg);
    s = `Command ${arg} has been deactivated!`;
  }

  return sendTo(msg.chat.id, s);
};
