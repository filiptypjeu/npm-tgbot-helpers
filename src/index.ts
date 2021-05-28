import { LocalStorage } from "node-localstorage";
import TelegramBot, { Message, ParseMode } from "node-telegram-bot-api";
import os from "os";
import readLastLines from "read-last-lines";
import sanitizeHtml from "sanitize-html";
import { Logger } from "log4js";

/**
 * @todo
 * - Command allowed for multiple groups?
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
  commandLogger?: Logger;
  botLogger?: Logger;
  errorLogger?: Logger;
  defaultAccessDeniedMessage?: string;
  defaultPrivateOnlyMessage?: string;
  defaultCommandDeactivatedMessage?: string;
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
let commandLogger: Logger | undefined;
let botLogger: Logger | undefined;
let errorLogger: Logger | undefined;

/**
 * Creates a RegExp for a command.
 *
 * @param c Command in question.
 * @param botName Name of the TelegramBot.
 */
export const commandRegExp = (c: IBotHelperCommand, botName: string): RegExp => {
  return c.matchBeginningOnly
    ? new RegExp(`^/${c.command}[a-zA-Z0-9_]*(?:$|@${botName}\\b|[^a-zA-Z0-9_@])`)
    : new RegExp(`^/${c.command}(?:$|@${botName}\\b|[^a-zA-Z0-9_@])`);
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

  groups = initWith.groups || [];
  if (initWith.errorGroup) {
    errorGroup = initWith.errorGroup;
  }
  if (initWith.globalVariables) {
    gVars = initWith.globalVariables;
  }
  if (initWith.userVariables) {
    uVars = initWith.userVariables;
  }
  if (initWith.commands) {
    commands = initWith.commands;
  }
  commandLogger = initWith.commandLogger;
  botLogger = initWith.botLogger;
  errorLogger = initWith.errorLogger;

  bot.getMe().then(user => {
    commands.forEach(async c => {
      bot.onText(commandRegExp(c, user.username!), msg => {
        let log = "ok";

        // Check if the command is deactivated
        if (!isInGroup(errorGroup, msg.chat.id) && isInGroup(deactivatedCommands, `/${c}`)) {
          sendTo(
            msg.chat.id,
            initWith.defaultPrivateOnlyMessage ? initWith.defaultPrivateOnlyMessage : "This command has been deactivated."
          );
          log = "deactivated";

        } else if (c.group && !isInGroup(c.group, msg.chat.id)) {
          sendTo(
            msg.chat.id,
            c.accessDeniedMessage
              ? c.accessDeniedMessage
              : initWith.defaultAccessDeniedMessage
              ? initWith.defaultAccessDeniedMessage
              : "You dont have access to this command."
          );
          log = "denied";

        } else if (c.privateOnly && msg.chat.type !== "private") {
          sendTo(
            msg.chat.id,
            initWith.defaultPrivateOnlyMessage ? initWith.defaultPrivateOnlyMessage : "The command can only be used in a private chat."
          );
          log = "private";

        }

        // Log the command
        commandLogger?.info(`${longNameFromUser(msg.from!)} : /${c.command} [${log}]`);

        if (log !== "ok") {
          return;
        }

        if (c.chatAcion) {
          bot.sendChatAction(msg.chat.id, c.chatAcion);
        }

        return c.callback(msg);
      });
    });
  });

  botLogger?.info(`Telegram bot initialized with ${commands.length} commands, ${groups.length} groups, ${gVars.length} global variables and ${uVars.length} user variables.`);

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

export const longNameFromUser = (user: TelegramBot.User | TelegramBot.Chat): string => {
  const title = (user as TelegramBot.Chat).title;
  if (title) {
    return title;
  }

  const a: string[] = [user.first_name || "", user.last_name || "", user.username ? "@" + user.username : ""];

  return a
    .filter(s => s)
    .join(" ")
    .trim();
};

export const getCommand = (msg: TelegramBot.Message): Command => {
  if (!msg.entities || msg.entities[0].offset !== 0 || msg.entities[0].type !== "bot_command") {
    return "";
  }

  return msg.text!.slice(1, msg.entities[0].length).split("@")[0];
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

/**
 * Returns whether or not a user/chat is member of a group.
 *
 * @param groupName The group in question.
 * @param userId The user/chat ID in question.
 */
export const isInGroup = (groupName: Group, userId: ChatID): boolean => {
  return variableToList(groupName).includes(userId.toString());
};

/**
 * Send a message to a chat. The message is automatically split into several messages if too long.
 *
 * @param userId The chat ID to send the message to.
 * @param text The text to send.
 * @param options Message options.
 */
export async function sendTo(userId: ChatID, text: string, options?: TelegramBot.SendMessageOptions): Promise<void>;
/**
 * Send a message to a chat. The message is automatically split into several messages if too long.
 *
 * @param userId The chat ID to send the message to.
 * @param text The text to send.
 * @param parseMode How to parse the text.
 * @param silent True = no notification is shown for the receiver.
 * @param noPreview  True = no web page preview is shown for the receiver.
 */
export async function sendTo(userId: ChatID, text: string, parseMode?: ParseMode, silent?: boolean, noPreview?: boolean): Promise<void>;
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
        errorLogger?.error(e);
      }
    });
}

/**
 * Send a message to each member of a group.
 *
 * @param groupName The group in question.
 * @param text The text to send.
 * @param options Message options.
 */
export async function sendToGroup(groupName: Group, text: string, options?: TelegramBot.SendMessageOptions): Promise<void[]>;
/**
 * Send a message to each member of a group.
 *
 * @param groupName The group in question.
 * @param text The text to send.
 * @param parseMode How to parse the text.
 * @param silent True = no notification is shown for the receiver.
 * @param noPreview  True = no web page preview is shown for the receiver.
 */
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
  botLogger?.error(e);
  return sendToGroup(errorGroup, e.toString() ? e.toString().slice(0, 3000) : "Error...");
};

/**
 * Get the value of a vraiable.
 *
 * @param variableName The name of the variable.
 */
export function variable(variableName: Variable): string;
/**
 * Set the value of a variable.
 *
 * @param variableName The name of the variable.
 * @param value The new value of the variable.
 */
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

/**
 * Get tha value of a variable as a Number.
 *
 * @param variableName The name of the variable.
 * @param defaultValue The Number to default to if the value is not found or not a number.
 */
export const variableToNumber = (variableName: string, defaultValue: number = 0): number => {
  const s = ls.getItem(variableName);
  return Number(s) ? Number(s) : defaultValue;
};

/**
 * Get the valur of a variable as a Boolean.
 *
 * @param variableName The name of the variable.
 *
 * @returns Returns True only if the value is "1".
 */
export const variableToBool = (variableName: string): boolean => {
  return ls.getItem(variableName) === "1";
};

/**
 * Get the value of a variable as a List of strings.
 *
 * @param variableName The name of the variable.
 */
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

/**
 * Get the value of a variable as an Object.
 *
 * @param variableName The name of the variable.
 */
export function variableToObject(variableName: Variable): object;
/**
 * Assuming the variable value can be parsed as JSON, sets one property of the Object.
 *
 * @param variableName The name of the variable.
 * @param property The property of the Object.
 * @param value The new property value.
 */
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

/**
 * Returns the user/chat ID inside commands that have a user/chat ID appended to them, for example "/command_1234567890" or "/command_1234567890@MyBot".
 *
 * @param command The full command.
 * @param splitAt The character that separates the command and ID.
 * @param minusSubstitute If the ID is of a group chat, which have negative chat IDs, the minus symbol need to be removed because Telegram commands can not have hyphens in them. Default substitue is "m" as in minus.
 */
export const userIdFromCommand = (msg: TelegramBot.Message, splitAt: string = "_", minusSubstitute: string = "m"): ChatID | undefined => {
  let arg = getCommand(msg).split(splitAt)[1];
  if (!arg) {
    return;
  }

  if (arg[0] === minusSubstitute) {
    arg = "-" + arg.slice(1);
  }

  const userId = Number(arg);

  if (Number.isSafeInteger(userId)) {
    return userId;
  }

  return;
};

export const commandFriendlyUserId = (userId: ChatID, minusSubstitute: string = "m"): string => {
  let s: string = userId.toString();
  if (s.length && s[0] === "-") {
    s = minusSubstitute + s.slice(1);
  }

  return s;
};

/**
 * Callback method for a command that respons with the current uptime of the bot and OS.
 */
export const defaultCommandUptime = async (msg: TelegramBot.Message) => {
  return Promise.all([getDurationString(startTime), getDurationString(os.uptime() * 1000)]).then(([s1, s2]) =>
    sendTo(msg.chat.id, `Bot uptime: ${s1}\nOS uptime: ${s2}`)
  );
};

/**
 * Callback method for a command that respons with the IP address(es) of the bot.
 */
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

/**
 * Creates a callback method for a command that sends a message to a specific chat. The command is expected to be used like "/command_CHATID <message>". The received message will look like "<header>\n<message>\n<footer>".
 *
 * @param header The header to use.
 * @param footer The footer to use.
 */
export const defaultCommandSendTo = (header?: string, footer?: string) => {
  return (msg: TelegramBot.Message) => {
    const text = msg
      .text!.split(" ")
      .slice(1)
      .join(" ")
      .trim();
    if (!text) {
      sendTo(msg.chat.id, `No text provided...`);
      return;
    }

    const chatId = userIdFromCommand(msg);
    if (!chatId) {
      sendTo(msg.chat.id, `No chat ID found...`);
      return;
    }

    bot
      .getChat(chatId)
      .then(chat => {
        sendTo(msg.chat.id, `Message sent to chat ${chatId}!`);
        sendTo(chat.id, `${header || ""}\n${text}\n${footer || ""}`.trim(), "HTML");
      })
      .catch(() => {
        sendTo(msg.chat.id, `No chat with ID ${chatId} is available to the bot...`);
        return;
      });

    return;
  };
};

/**
 * Creates a callback method for a command that let's a user send a message to all members of a group. It is used by writing the message after the command, i.e. "/command <message>".
 *
 * @param groupName The name of the group to send the message to.
 * @param emptyResponse The response to the user if the command is used without a message.
 * @param messageFormatter Function that formats the message to be sent. Can be used to for example add a header or footer to the message.
 */
export const defaultCommandSendToGroup = (
  groupName: Group,
  emptyResponse: string,
  messageFormatter: (messageToFormat: TelegramBot.Message) => string
) => {
  return (msg: TelegramBot.Message) => {
    if (getArguments(msg.text)[0] === undefined && emptyResponse) {
      sendTo(msg.chat.id, emptyResponse, "HTML");
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
    s = `Use /${getCommand(msg)} /&lt;command&gt; to deactivate/activate command.\n\n${
      deactivated.length === 0
        ? "No deactivated commands found."
        : `<b>Deactivated commands:</b>\n${deactivated.map((v, i) => `${i} ${v}`).join("\n")}`
    }`;
  } else if (Number(arg) < deactivated.length) {
    toggleUserIdInGroup(deactivatedCommands, deactivated[Number(arg)]);
    s = `Command ${deactivated[Number(arg)]} has been reactivated!`;
  } else if (arg.indexOf("/") !== 0) {
    s = `Number not correct, or command not starting with '/'.`;
  } else {
    toggleUserIdInGroup(deactivatedCommands, arg);
    s = `Command ${arg} has been deactivated!`;
  }

  return sendTo(msg.chat.id, s, "HTML");
};

/**
 * Creates a callback method for a command that requests access to a group of another group.
 *
 * @param requestFor The group that the request is for.
 * @param sendRequestTo The group that receives the request.
 * @param response The response to send to the user directly after sending the request.
 * @param toggleCommand The command that can be used to grant access to the group in question. The command need to look like "/command_CHATID".
 */
export const defaultCommandRequest = (requestFor: Group, sendRequestTo: Group, response: string, toggleCommand: Command) => {
  return (msg: TelegramBot.Message) => {
    if (response) {
      sendTo(msg.chat.id, response);
    }
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
    const userId = userIdFromCommand(msg);
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

/**
 * Created a callback method for a simple /start command. A response is sent to the chat, and the chat ID is saved to a group. Another group can also be notified of this.
 *
 * @param response The respone to send to the user.
 * @param addToGroup The group the user should be added to when using the command for the first time.
 * @param alertGroup The group to alert.
 * @param alertMessage The alert message. Using "$CHATID" and "$INFO" in the alert message will replace those tags with the chat ID and info about the user respectively.
 */
export const defaultCommandStart = (response: string, addToGroup: Group, alertGroup?: Group, alertMessage?: string) => {
  return (msg: TelegramBot.Message) => {
    sendTo(msg.chat.id, response, "HTML");
    if (addUserIdToGroup(addToGroup, msg.chat.id) && alertGroup) {
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
