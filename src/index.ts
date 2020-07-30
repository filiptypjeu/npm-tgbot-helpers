import fs from "fs";
import { LocalStorage } from "node-localstorage";
import TelegramBot, { Message, ParseMode } from "node-telegram-bot-api";
import os from "os";
import readLastLines from "read-last-lines";
import sanitizeHtml from "sanitize-html";

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
  groups?: string[];
  errorGroup?: string;
  commandLogPath?: string;
  defaultAccessDeniedMessage?: string;
  defaultPrivateOnlyMessage?: string;
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
  command: Command;
  regexp?: RegExp;
  group?: Group;
  privateOnly?: boolean;
  matchBeginningOnly?: boolean;
  hide?: boolean;
  description?: string;
  chatAcion?: TelegramBot.ChatAction;
  accessDeniedMessage?: string;
  callback: (msg: Message) => void;
}

type Group = string;
type Variable = string;
type Command = string;
type ChatID = string | number;

let bot: TelegramBot;
let ls: LocalStorage;

const startTime = new Date();
const deactivatedCommands: Variable = "TGBOT_deactivatedcommands";
let commands: IBotHelperCommand[] = [];
let groups: Group[] = [];
let errorGroup: Group = "";
let uVars: Variable[] = [];
let gVars: Variable[] = [];
let commandLogPath = "./logs/commands.log";

const commandRegExp = (c: IBotHelperCommand): RegExp => {
  return c.matchBeginningOnly ? new RegExp(`^/${c.command}`) : new RegExp(`^/${c.command}\\b`);
};

/**
 * @param {number | Date} value is the value based on which the duration should be calculated on. Can either be the number of milliseconds of the duration, or a Date object that specifies the start time.
 *
 * @returns {string} the duration in a 'days hours minutes seconds' format.
 */
const getDurationString = (value: number | Date): string => {
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

  return `${d} day${d === 1 ? "" : "s"} ${h} hour${h === 1 ? "" : "s"} ${m} minute${m === 1 ? "" : "s"} ${s} second${s === 1 ? "" : "s"}`;
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

  if (initWith.groups) {
    groups = initWith.groups;
  }
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
        sendTo(
          msg.chat.id,
          c.accessDeniedMessage
            ? c.accessDeniedMessage
            : initWith.defaultAccessDeniedMessage
            ? initWith.defaultAccessDeniedMessage
            : "You dont have access to this command."
        );
        console.log(`User not in group ${c.group}.`);
        return;
      }

      if (c.privateOnly && msg.chat.type !== "private") {
        sendTo(
          msg.chat.id,
          initWith.defaultPrivateOnlyMessage ? initWith.defaultPrivateOnlyMessage : "The command can only be used in a private chat."
        );
        console.log(`Not in private chat.`);
        return;
      }

      console.log("Callback called.");
      if (c.chatAcion) {
        bot.sendChatAction(msg.chat.id, c.chatAcion);
      }
      return c.callback(msg);
    });
  });

  console.log(
    `Telegram bot initialized with ${commands.length} commands, ${groupToUserInfo.length} groups, ${gVars.length} global variables and ${uVars.length} user variables.`
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

export const longNameFromUser = (user: TelegramBot.User): string => {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();

  if (name && user.username) {
    return `${user.username} (${name})`;
  }

  return name ? name : user.username!;
}

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

export const isInGroup = (groupName: Group, userId: ChatID) => {
  return variableToList(groupName).includes(userId.toString());
};

export async function sendTo(userId: ChatID, text: string, options?: TelegramBot.SendMessageOptions): Promise<void>;
export async function sendTo(
  userId: ChatID,
  text: string,
  parseMode?: ParseMode,
  silent?: boolean,
  noPreview?: boolean
): Promise<void>;
export async function sendTo(
  userId: ChatID,
  text: string,
  param?: ParseMode | TelegramBot.SendMessageOptions,
  silent: boolean = false,
  noPreview: boolean = false
) {
  const sendOptions: TelegramBot.SendMessageOptions =
    typeof param === "object"
      ? param
      : {
          parse_mode: param,
          disable_notification: silent,
          disable_web_page_preview: noPreview,
        };

  bot
    .sendMessage(userId, sendOptions.parse_mode === "HTML" ? sanitizeHtml(text, { allowedTags: ["b", "i"] }) : text, sendOptions)
    .catch(async e => {
      if (e.code === "ETELEGRAM") {
        if (e.response.body.description === "Bad Request: message is too long") {
          const splitText = text.split("\n");
          if (splitText.length > 1) {
            await sendTo(
              userId,
              splitText
                .slice(0, Math.round(splitText.length / 2))
                .join("\n")
                .trim(),
              sendOptions
            );
            await sendTo(
              userId,
              splitText
                .slice(Math.round(splitText.length / 2))
                .join("\n")
                .trim(),
              sendOptions
            );
          } else {
            sendError(`Message to userId ${userId} too long (${text.length} characters)...`);
          }
        } else {
          sendError(
            `Error code: ${e.code}, msg_length: ${text.length}, ok: ${e.response.body.ok}, error_code: ${e.response.body.error_code}, description: ${e.response.body.description}`
          );
        }
      } else {
        console.log(e.code);
        console.log(e.response.body);
      }
    });
}

export async function sendToGroup(groupName: Group, text: string, options?: TelegramBot.SendMessageOptions): Promise<void[]>;
export async function sendToGroup(
  groupName: Group,
  text: string,
  parseMode?: ParseMode,
  silent?: boolean,
  noPreview?: boolean
): Promise<void[]>;
export async function sendToGroup(
  groupName: Group,
  text: string,
  param?: ParseMode | TelegramBot.SendMessageOptions,
  silent: boolean = false,
  noPreview: boolean = false
) {
  const sendOptions: TelegramBot.SendMessageOptions =
    typeof param === "object"
      ? param
      : {
          parse_mode: param,
          disable_notification: silent,
          disable_web_page_preview: noPreview,
        };
  return Promise.all(variableToList(groupName).map(id => sendTo(id, text, sendOptions)));
}

export const sendError = async (e: any) => {
  console.error(e);
  return sendToGroup(errorGroup, e.toString() ? e.toString().slice(0, 3000) : "Error...");
};

export function variable(variableName: Variable): string;
export function variable(variableName: Variable, value: string | number | Array<string | number> | object): void;
export function variable(variableName: Variable, value?: string | number | Array<string | number> | object) {
  if (value === undefined) {
    return ls.getItem(variableName) || "";
  }

  if (Array.isArray(value)) {
    return ls.setItem(variableName, value.join("\n"));
  } else if (typeof value === "object") {
    return ls.setItem(variableName, JSON.stringify(value));
  }

  return ls.setItem(variableName, value.toString());
}

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

export function variableToObject(variableName: Variable): object;
export function variableToObject(variableName: Variable, property: string, value?: any): void;
export function variableToObject(variableName: Variable, property?: string, value?: any) {
  const object = JSON.parse(variable(variableName) || "{}");
  if (!property) {
    return object;
  }
  if (value === undefined) {
    delete object[property];
  } else {
    object[property] = value;
  }
  variable(variableName, JSON.stringify(object));
  return;
}

export const userVariable = (variableName: Variable, userId: ChatID) => {
  return variableName + "_" + userId;
};

export const groupToUserInfo = async (variableName: Variable, extraInfo?: string[]) => {
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

export const addUserIdToGroup = (groupName: Group, userId: ChatID): boolean => {
  const userIds = variableToList(groupName);

  if (!userIds.includes(userId.toString())) {
    userIds.push(userId.toString());
    variable(groupName, userIds.join("\n"));
    return true;
  }
  return false;
};

export const toggleUserIdInGroup = (groupName: Group, userId: ChatID): boolean => {
  const userIds = variableToList(groupName);

  if (userIds.includes(userId.toString())) {
    variable(groupName, userIds.filter(id => id !== userId.toString()).join("\n"));
    return false;
  }

  userIds.push(userId.toString());
  variable(groupName, userIds.join("\n"));
  return true;
};

export const userIdFromCommand = (command: Command, splitAt: string = "_", minusSubstitute: string = "m"): ChatID | undefined => {
  let arg = command.split(splitAt)[1];
  if (!arg.length) {
    return undefined;
  }

  if (arg[0] === minusSubstitute) {
    arg = "-" + arg.slice(1);
  }

  const userId = Number(arg);

  if (Number.isSafeInteger(userId)) {
    return userId;
  }

  return undefined;
}

export const commandFriendlyUserId = (userId: ChatID, minusSubstitute: string = "m"): string => {
  let s: string = userId.toString();
  if (s.length && s[0] === "-") {
    s = minusSubstitute + s.slice(1);
  }

  return s;
}

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
    ifaces[ifname]!.forEach(iface => {
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
        `<b>Commands accessible to ${group ? `group <i>${group}</i>` : "everybody"}:</b>\n` +
          cmds
            .map(cmd => `${cmd.hide ? "(" : ""}/${cmd.command}${cmd.privateOnly ? "*" : ""}${cmd.hide ? ")" : ""}`)
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
      .map(cmd => `/${cmd.command}${cmd.privateOnly ? "*" : ""}${cmd.description ? ":  " + cmd.description : ""}`)
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

export const defaultCommandVar = (variables?: Variable[]) => {
  return async (msg: TelegramBot.Message) => {
    const varsToUse: Variable[] = variables || gVars;
    const args = getArguments(msg.text);

    if (!args[0]) {
      return sendTo(
        msg.chat.id,
        "<b>Available variables:</b>\n" +
          varsToUse
            .map((v, i) => {
              const value = variable(v);
              return `${i} ${v} ${value ? value : "null"}`;
            })
            .join("\n"),
        "HTML"
      );
    } else if (!args[1]) {
      return sendTo(msg.chat.id, "Please provide two arguments.");
    } else if (Number(args[0]) >= 0 && Number(args[0]) < varsToUse.length) {
      variable(
        varsToUse[Number(args[0])],
        args
          .slice(1)
          .join(" ")
          .trim()
      );
      return sendTo(msg.chat.id, `Variable set: <b>${varsToUse[Number(args[0])]} = ${variable(varsToUse[Number(args[0])])}</b>`, "HTML");
    } else {
      return sendTo(msg.chat.id, `Variable ${args[0]} does not exist.`);
    }
  };
};

export const defaultCommandSendTo = (header?: string, footer?: string) => {
  return (msg: TelegramBot.Message) => {
    const text = msg.text!.split(" ").slice(1).join(" ").trim();
    if (!text) {
      sendTo(msg.chat.id, `No text provided...`);
      return;
    }

    const chatId = userIdFromCommand(msg.text!.split(" ")[0]);
    if (!chatId) {
      sendTo(msg.chat.id, `No chat ID found...`);
      return;
    }

    bot.getChat(chatId)
      .then(chat => {
        sendTo(msg.chat.id, `Message sent to chat ${chatId}!`);
        sendTo(
          chat.id,
          `${header || ""}\n${text}\n${footer || ""}`.trim(),
          "HTML"
        );
      })
      .catch(() => {
        sendTo(msg.chat.id, `No chat with ID ${chatId} is available to the bot...`);
        return;
      });

    return;
  };
};

export const defaultCommandSendToGroup = (groupName: Group, emptyResponse: string, messageFormatter: (messageToFormat: TelegramBot.Message) => string) => {
  return (msg: TelegramBot.Message) => {
    if (getArguments(msg.text)[0] === undefined) {
      sendTo(msg.chat.id, emptyResponse);
    } else {
      sendToGroup(groupName, messageFormatter(msg), "HTML");
      sendTo(msg.chat.id, "Message sent!");
    }
  };
};

/**
 * Creates a callback method for a command that reads the last lines from a certain file and sends them to the chat. The amount of lines can be given as an argument when using the command.
 *
 * @param logPath The path to the file to read from.
 * @param keys Optional string to use as a header.
 */
export const defaultCommandLog = (logPath: string, keys?: string) => {
  return async (msg: TelegramBot.Message) => {
    return readLastLines
      .read(logPath, Number(getArguments(msg.text)[0]) < 50 ? Number(getArguments(msg.text)[0]) : 50)
      .then(s => sendTo(msg.chat.id, s ? (keys ? `<b>${keys}</b>\n${s}` : s) : `File ${logPath} is empty.`, "HTML"))
      .catch(e => sendError(e));
  };
};

/**
 * Creates a callback method for a command that adds a chat to a certain gruop. Useful when for example starting the bot for the first time and adding yourself as the first admin.
 *
 * @param groupToInitTo The group to add the chat to.
 */
export const defaultCommandInit = (groupToInitTo: Group) => {
  return (msg: TelegramBot.Message) => {
    const userIds = variableToList(groupToInitTo);
    if (!userIds.length) {
      if (toggleUserIdInGroup(groupToInitTo, msg.chat.id)) {
        sendTo(msg.chat.id, `You have been added to group <i>${groupToInitTo}</i>!`, "HTML");
      }
    } else {
      sendTo(msg.chat.id, "No, I don't think so.");
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

export const defaultCommandRequest = (requestFor: Group, sendRequestTo: Group, response: string, toggleCommand: Command) => {
  return (msg: TelegramBot.Message) => {
    sendTo(msg.chat.id, response);
    sendToGroup(
      sendRequestTo,
      `<b>Request for group <i>${requestFor}</i>:</b>\n - ` +
        msgInfoToString(msg).join("\n - ") +
        `\n - Is in group: ${isInGroup(requestFor, msg.chat.id)}\n` +
        `/${toggleCommand}_${commandFriendlyUserId(msg.chat.id)}`,
      "HTML"
    );
  };
};

/**
 * Create a callback method for a command that adds a certain chat to a group. The command has to be in the form "/<CMD>_<CHATID>", so that the chat ID in question can be retrieved from the command itself.
 *
 * @param requestFor The group.
 * @param response The response for the one using the command.
 *
 * @returns A callback method for a command.
 */
export const defaultCommandToggle = (requestFor: Group, response: string) => {
  return (msg: TelegramBot.Message) => {
    const userId = userIdFromCommand(msg.text!.split(" ")[0]);
    if (!userId) {
      sendTo(msg.chat.id, `Use ${msg.text!.split(" ")[0].split("_")[0]}_CHATID to toggle CHATID for group <i>${requestFor}</i>.`, "HTML");
      return;
    }

    if (toggleUserIdInGroup(requestFor, userId)) {
      sendTo(msg.chat.id, `Chat ${userId} has been added to group <i>${requestFor}</i>.`, "HTML");
      sendTo(userId, response);
      return;
    }

    sendTo(msg.chat.id, `Chat ${userId} has been removed from group <i>${requestFor}</i>.`, "HTML");
  };
};

export const defaultCommandStart = (response: string, addToGroup: Group, alertGroup: Group, alertMessage?: string) => {
  return (msg: TelegramBot.Message) => {
    sendTo(msg.chat.id, response, "HTML");
    if (addUserIdToGroup(addToGroup, msg.chat.id)) {
      const message = alertMessage ? alertMessage : `<b>Chat $CHATID has used the start command!</b>\n$INFO`;

      sendToGroup(
        alertGroup,
        message
          .split("$CHATID")
          .join(msg.chat.id.toString())
          .split("$INFO")
          .join(
            msgInfoToString(msg)
              .map(s => " - " + s)
              .join("\n")
          ),
        "HTML"
      );
    }
  };
};

export const defaultCommandGroups = () => {
  return (msg: TelegramBot.Message) => {
    const n = Number(getArguments(msg.text)[0]);

    if (n >= 0 && n < groups.length) {
      const groupName = groups[n];
      groupToUserInfo(groupName)
        .then(a => {
          const message =
            a.length === 0
              ? `No chats in group <i>${groupName}</i>.`
              : `<b>Chats in group <i>${groupName}</i></b>:\n${a.map(s => ` - ${s}`).join("\n")}`;
          sendTo(msg.chat.id, message, "HTML");
        })
        .catch(e => sendError(e));
    } else {
      sendTo(
        msg.chat.id,
        groups.length > 0 ? `<b>Available groups</b>:\n${groups.map((g, i) => `${i} ${g}`).join("\n")}` : "No groups available...",
        "HTML"
      );
    }
  };
};
