import TelegramBot = require('node-telegram-bot-api');
import { LocalStorage } from 'node-localstorage';
import {
  properties,
  initBot,
  sendTo,
  toggleAdmin,
  toggleUserIdInList,
  variableIsTrue,
  variableNumber,
  variable,
  sendToAdmins,
  sendToList,
} from '../index';

initBot({
  telegramBotToken: 'token',
  localStoragePath: './src/__tests__/variables/',
  globalVariables: ['testVariable'],
  userVariables: ['var1', 'var2'],
});

const props = properties();
const bot = props.telegramBot;
const ls = props.localStorage;

test('properties', () => {
  expect(bot).toEqual(expect.any(TelegramBot));
  expect(ls).toEqual(expect.any(LocalStorage));
  expect(props.globalVariables).toEqual(['adminsSendErrors', 'testVariable']);
  expect(props.userVariables).toEqual(['var1', 'var2']);
});

jest.mock('node-telegram-bot-api');

test('variable', () => {
  ls.setItem('v1', '123');
  expect(variable('v1')).toEqual('123');

  variable('v2', 1);
  expect(variable('v2')).toEqual('1');

  variable('v3', 'string');
  expect(variable('v3')).toEqual('string');
});

test('variableNumber', () => {
  expect(variableNumber('v1')).toEqual(123);
  expect(variableNumber('v2')).toEqual(1);
  expect(variableNumber('v3')).toEqual(0);
  expect(variableNumber('v1', 5)).toEqual(123);
  expect(variableNumber('v2', 5)).toEqual(1);
  expect(variableNumber('v3', 5)).toEqual(5);
});

test('variableIsTrue', () => {
  expect(variableIsTrue('v1')).toEqual(false);
  expect(variableIsTrue('v2')).toEqual(true);
  expect(variableIsTrue('v3')).toEqual(false);
});

test('toggleUserIdInList', () => {
  variable('variable', '');
  expect(toggleUserIdInList(11111, 'variable')).toEqual(true);
  expect(toggleUserIdInList(22222, 'variable')).toEqual(true);
  expect(toggleUserIdInList(1, 'variable')).toEqual(true);
  expect(toggleUserIdInList(1, 'variable')).toEqual(false);
});

test('toggleAdmin', () => {
  variable('TGHELPERS#ADMINUSERIDS', '');
  expect(toggleAdmin(12345)).toEqual(true);
  expect(toggleAdmin(54321)).toEqual(true);
  expect(toggleAdmin(1)).toEqual(true);
  expect(toggleAdmin(1)).toEqual(false);
});

test('sendTo', () => {
  expect(sendTo(123, 'message')).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenCalledWith(123, 'message', { parse_mode: undefined });

  expect(sendTo(123, 'message', 'HTML')).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenCalledWith(123, 'message', { parse_mode: 'HTML' });

  expect(sendTo(123, 'message', 'Markdown')).rejects.toThrowError();
  expect(bot.sendMessage).toHaveBeenCalledWith(123, 'message', { parse_mode: 'Markdown' });

  expect(bot.sendMessage).toHaveBeenCalledTimes(3);
});

test('sendToList', () => {
  expect(sendToList('variable', 'message')).rejects.toThrowError();

  expect(bot.sendMessage).toHaveBeenCalledWith('11111', 'message', { parse_mode: undefined });
  expect(bot.sendMessage).toHaveBeenCalledWith('22222', 'message', { parse_mode: undefined });

  expect(bot.sendMessage).toHaveBeenCalledTimes(5);
});

test('sendToAdmins', () => {
  expect(sendToAdmins('message')).rejects.toThrowError();

  expect(bot.sendMessage).toHaveBeenCalledWith('12345', 'message', { parse_mode: undefined });
  expect(bot.sendMessage).toHaveBeenCalledWith('54321', 'message', { parse_mode: undefined });

  expect(bot.sendMessage).toHaveBeenCalledTimes(7);
});
