import { Actions } from './action'

export interface IAction {
  action: string;
}

export interface IRunAction extends IAction {
  action: Actions.RUN;
  payload: any;
}

export interface IErrorAction extends IAction {
  action: Actions.ERROR;
  payload: any;
}

export interface IResultAction extends IAction {
  action: Actions.RESULT;
  payload: any;
}