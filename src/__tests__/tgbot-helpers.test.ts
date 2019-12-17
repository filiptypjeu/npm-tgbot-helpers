import TelegramBot = require('node-telegram-bot-api');
import { LocalStorage } from 'node-localstorage';
import {
  properties,
  initBot,
  sendTo,
  toggleUserIdInGroup,
  variableToBool,
  variableToNumber,
  variableToList,
  variable,
  sendToGroup,
  getArguments,
  isInGroup,
  sendError,
  groupToUserInfo,
} from '../index';

initBot({
  telegramBotToken: 'token',
  localStoragePath: './src/__tests__/variables/',
  globalVariables: ['testVariable'],
  userVariables: ['var1', 'var2'],
  errorGroup: "errorgroup"
});

const props = properties();
const bot = props.telegramBot;
const ls = props.localStorage;

test('properties', () => {
  expect(bot).toEqual(expect.any(TelegramBot));
  expect(ls).toEqual(expect.any(LocalStorage));
  expect(props.globalVariables).toEqual(['testVariable']);
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

test('variableToNumber', () => {
  expect(variableToNumber('v1')).toEqual(123);
  expect(variableToNumber('v2')).toEqual(1);
  expect(variableToNumber('v3')).toEqual(0);
  expect(variableToNumber('v1', 5)).toEqual(123);
  expect(variableToNumber('v2', 5)).toEqual(1);
  expect(variableToNumber('v3', 5)).toEqual(5);
});

test('variableToBool', () => {
  expect(variableToBool('v1')).toEqual(false);
  expect(variableToBool('v2')).toEqual(true);
  expect(variableToBool('v3')).toEqual(false);
});

test('toggleUserIdInGroup', () => {
  variable('group', '');
  variable('errorgroup', '');
  expect(toggleUserIdInGroup('group', 11111)).toEqual(true);
  expect(toggleUserIdInGroup('group', 22222)).toEqual(true);
  expect(toggleUserIdInGroup('group', 1)).toEqual(true);
  expect(toggleUserIdInGroup('group', 1)).toEqual(false);
  expect(toggleUserIdInGroup('errorgroup', 33333)).toEqual(true);
});

test('variableToList', () => {
  expect(variableToList('group')).toEqual(['11111', '22222']);
  expect(variableToList('errorgroup')).toEqual(['33333']);
  expect(variableToList('notagroup')).toEqual([]);
});

test('isInGroup', () => {
  expect(isInGroup('group', 11111)).toEqual(true);
  expect(isInGroup('group', 22222)).toEqual(true);
  expect(isInGroup('group', 33333)).toEqual(false);
  expect(isInGroup('errorgroup', 33333)).toEqual(true);
  expect(isInGroup('notagroup', 11111)).toEqual(false);
});

test('getArguments', () => {
  expect(getArguments('/test a b c')).toEqual(['a', 'b', 'c']);
  expect(getArguments('test a b c')).toEqual(['a', 'b', 'c']);
  expect(getArguments('/test\na     b   \n\n   \n c   \n  ')).toEqual(['a', 'b', 'c']);
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

test('sendToGroup', () => {
  expect(sendToGroup('group', 'message')).rejects.toThrowError();

  expect(bot.sendMessage).toHaveBeenCalledWith('11111', 'message', { parse_mode: undefined });
  expect(bot.sendMessage).toHaveBeenCalledWith('22222', 'message', { parse_mode: undefined });

  expect(bot.sendMessage).toHaveBeenCalledTimes(5);
});

test('sendError', () => {
  expect(sendError('Error')).rejects.toThrowError();

  expect(bot.sendMessage).toHaveBeenCalledWith('33333', 'Error', { parse_mode: undefined });

  expect(bot.sendMessage).toHaveBeenCalledTimes(6);
});

test('groupToUserInfo', () => {
  expect(groupToUserInfo('group')).rejects.toThrowError();

  expect(bot.getChat).toHaveBeenCalledWith('11111');
  expect(bot.getChat).toHaveBeenCalledWith('22222');

  expect(bot.getChat).toHaveBeenCalledTimes(2);
});
