import { LocalStorage } from 'node-localstorage';
import TelegramBot, { ParseMode, Message } from 'node-telegram-bot-api';
import fs from "fs";
import os from "os";

/**
 * @todo
 * - Command allowed for multiple groups?
 * - Pre-defined commands (/init, /ip, /commands, /help etc.)
 * - Add suppoert for command@BotName
 * - Group existense checks
 * - Several commands
 */

export interface IBotHelperInit {
  telegramBotToken: string;
  telegramBotName?: string;
  localStoragePath: string;
  globalVariables?: string[];
  userVariables?: string[];
  commands?: IBotHelperCommand[];
  groups?: string[];
  errorGroup?: string;
  commandLogPath?: string;
}

export interface IBotHelperProps {
  telegramBot: TelegramBot;
  localStorage: LocalStorage;
  globalVariables: string[];
  userVariables: string[];
  commands: IBotHelperCommand[];
  groups: string[];
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

let commands: IBotHelperCommand[] = [];
let groups: string[] = [];
let errorGroup: string = "";
let uVars: string[] = [];
let gVars: string[] = [];
let commandLogPath = "./logs/commands.log";

const commandRegExp = (c: IBotHelperCommand): RegExp => {
  return c.matchBeginningOnly ? new RegExp(`^/${c.command}`) : new RegExp(`^/${c.command}\\b`);
}

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
}

const groupByGroup = (cmds: IBotHelperCommand[]) => {
  const m = new Map<string, IBotHelperCommand[]>();
  commands.forEach(cmd => {
    const g = cmd.group || "";
    m.set(g, (m.get(g) || []).concat(cmd));
  });

  return m;
}

export const initBot = (initWith: IBotHelperInit): TelegramBot => {
  bot = new TelegramBot(initWith.telegramBotToken, { polling: true });
  ls = new LocalStorage(initWith.localStoragePath);

  if (initWith.groups) groups = initWith.groups;
  if (initWith.errorGroup) errorGroup = initWith.errorGroup;
  if (initWith.globalVariables) gVars = initWith.globalVariables;
  if (initWith.userVariables) uVars = initWith.userVariables;
  if (initWith.commandLogPath) commandLogPath = initWith.commandLogPath;
  if (initWith.commands) commands = initWith.commands;

  commands.forEach(async c => {
    bot.onText(commandRegExp(c), msg => {
      fs.appendFile(commandLogPath,
        `${Date.now()};/${c.command};${msg.from!.id};${msg.from!.username}\n`,
        e => {
          if (e) {
            sendError(e);
          }
        }
      );

      console.log(`User ${msg.from!.id} used command /${c.command}.`);

      if (c.group && !isInGroup(c.group, msg.chat.id)) {
        console.log(`User not in group ${c.group}.`);
        return;
      }

      if (c.privateOnly && msg.chat.type !== 'private') {
        sendTo(msg.chat.id, "The command can only be used in a private chat.");
        console.log(`Not in private chat.`);
        return;
      }

      console.log("Callback called.")
      return c.callback(msg);
    });
  });

  console.log(`Telegram bot initialized with ${commands.length} commands, ${groups.length} groups, ${gVars.length} global variables and ${uVars.length} user variables.`);

  return bot;
};

export const properties = (): IBotHelperProps => {
  const p: IBotHelperProps = {
    globalVariables: gVars,
    localStorage: ls,
    telegramBot: bot,
    userVariables: uVars,
    commands: commands,
  };
  return p;
};

export const globalVariables = (): string[] => {
  return gVars;
};

export const isInList = (userId: number | string, variableName: string) => {
  return stringListFromVariable(variableName).includes(userId.toString());
};

export const isAdmin = (userId: number) => {
  return isInList(userId, adminListVariable);
};

export const sendTo = async (userId: number | string, text: string, parseMode?: ParseMode) => {
  bot.sendMessage(userId, text, { parse_mode: parseMode }).catch(e => {
    if (e.code === 'ETELEGRAM') {
      sendError(
        `Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`,
      );
    } else {
      console.log(e.code);
      console.log(e.response.body);
    }
  });
};

export const sendToList = async (variableName: string, text: string, parseMode?: ParseMode) => {
  return Promise.all(stringListFromVariable(variableName).map(id => sendTo(id, text, parseMode)));
};

export const sendToAdmins = async (text: string, parseMode?: ParseMode) => {
  return sendToList(adminListVariable, text, parseMode);
};

export const sendError = async (e: any) => {
  console.error(e);
  if (variableIsTrue('godsSendErrors')) {
    sendToAdmins(e.toString() ? e.toString().slice(0, 3000) : 'Error...');
  }
};

export const variable = (variableName: string, value?: string | number) => {
  if (value === undefined) {
    const s = ls.getItem(variableName);
    return s ? s : '';
  }
  return ls.setItem(variableName, value.toString());
};

export const variableNumber = (variableName: string, defaultValue: number = 0): number => {
  const s = ls.getItem(variableName);
  return Number(s) ? Number(s) : defaultValue;
};

export const variableIsTrue = (variableName: string): boolean => {
  return ls.getItem(variableName) === '1';
};

export const userIdsToInfo = async (variableName: string, extraInfo?: string[]) => {
  const userIds = stringListFromVariable(variableName);

  if (userIds.length > 0) {
    return await Promise.all(
      userIds.map(async (n, i) => {
        return await bot.getChat(n).then(chat => {
          return `${chat.first_name} ${chat.last_name}, ${chat.username} (ID: ${n}${
            extraInfo ? `, ${extraInfo[i] ? extraInfo[i] : 'no info'}` : ''
          })`;
        });
      }),
    );
  } else {
    return [];
  }
};

export const toggleUserIdInList = (userId: number | string, variableName: string) => {
  const userIds = stringListFromVariable(variableName);

  if (userIds.includes(userId.toString())) {
    variable(variableName, userIds.filter(id => id !== userId.toString()).join('\n'));
    return false;
  }

  userIds.push(userId.toString());
  variable(variableName, userIds.join('\n'));
  return true;
};

export const toggleAdmin = (userId: number) => {
  return toggleUserIdInList(userId, adminListVariable);
};
