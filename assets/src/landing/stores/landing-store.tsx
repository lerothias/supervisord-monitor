import { IPromiseBasedObservable } from 'mobx-utils';
import { action, makeObservable, observable } from 'mobx';
import { Notificator } from './notificator';
import { TokenStorage } from './token-storage';
import { useInvalidateSupervisors } from '~/api/use-get-supervisors';
import { useManageSupervisors } from '~/api/use-manage-supervisors';

export class LandingStore {
  prevData?: IPromiseBasedObservable<ApiSupervisor[]>;
  actualData?: IPromiseBasedObservable<ApiSupervisor[]>;

  autoRefreshIsActive: boolean;
  isAllowMutatorsActive: boolean;
  serverTimeDiff: number;

  constructor(
    private notificator: Notificator,
    private tokenStorage: TokenStorage,
    private manageSupervisors: ReturnType<typeof useManageSupervisors>,
    private invalidateSupervisors: ReturnType<typeof useInvalidateSupervisors>
  ) {
    makeObservable(this, {
      actualData: observable,
      prevData: observable,
      autoRefreshIsActive: observable,
      isAllowMutatorsActive: observable,
      serverTimeDiff: observable,
      updateAutoRefresh: action,
      switchAllowMutators: action,
      setServerTimeDiff: action,
    });

    this.autoRefreshIsActive = this.tokenStorage.isAutoRefresh();
    this.isAllowMutatorsActive = this.tokenStorage.isAllowMutatorsEnabled();
    this.serverTimeDiff = 0;

    this.manageSupervisors = useManageSupervisors();
    this.invalidateSupervisors = useInvalidateSupervisors();

    this.scheduleFetchDataRecursive();
    this.scheduleAutoIncrementTimeDiff();
  }

  scheduleFetchDataRecursive(): void {
    setInterval(() => {
      if (this.tokenStorage.isAutoRefresh()) {
        this.invalidateSupervisors();
        this.notificator.success('Data auto-refreshed');
      }
    }, 10 * 1000);
  }

  scheduleAutoIncrementTimeDiff(): void {
    setInterval(() => {
      this.setServerTimeDiff(this.getServerTimeDiff() + 1);
    }, 1000);
  }

  async resetDiffWhenActualDataIsFetched() {
    this.setServerTimeDiff(0);
  }

  updateAutoRefresh(active: boolean): void {
    if (active) {
      this.autoRefreshIsActive = true;
      this.tokenStorage.setAutoRefresh();
      this.notificator.success('Auto refresh enabled');
    } else {
      this.autoRefreshIsActive = false;
      this.tokenStorage.unsetAutoRefresh();
      this.notificator.success('Auto refresh disabled');
    }
  }

  switchAllowMutators(): void {
    if (this.tokenStorage.isAllowMutatorsEnabled()) {
      this.tokenStorage.unsetAllowMutatorsEnabled();
      this.isAllowMutatorsActive = false;
      this.notificator.success('Allow mutators disabled');
    } else {
      this.tokenStorage.setAllowMutatorsEnabled();
      this.isAllowMutatorsActive = true;
      this.notificator.success('Allow mutators enabled');
    }
  }

  getServerTimeDiff(): number {
    return this.serverTimeDiff;
  }

  setServerTimeDiff(value: number) {
    this.serverTimeDiff = value;
  }

  notifyErr(err: any) {
    this.notificator.error(err.message ?? 'Something went wrong: ' + '\n\n' + err.response.data.detail ?? 'No details');
  }

  checkValidResultSuccess(result: ApiSupervisorSupervisorManageResult): boolean {
    if (result?.operationResult) {
      if (result.operationResult.isFault) {
        this.notificator.error('Operation got fault: ' + result.operationResult.error);
      }

      return result.operationResult.ok;
    }

    if (result?.changedProcesses) {
      if (!result.changedProcesses.ok) {
        this.notificator.error('Got error while changing processes: ' + result.changedProcesses.error);
      }
      return result.changedProcesses.ok;
    }

    return false;
  }

  clearProcessLog(server: ApiSupervisorServer, process: ApiProcess): void {
    this.manageSupervisors
      .mutateAsync({ server: server.name, type: 'clear_process_log', group: process.group, process: process.name })
      .then(result => {
        if (this.checkValidResultSuccess(result)) {
          this.notificator.success(`Process ${process.name} log cleared on server ${server.name}`);
        }
        this.invalidateSupervisors();
      })
      .catch(err => this.notifyErr(err));
  }

  cloneProcess(server: ApiSupervisorServer, process: ApiProcess): void {
    this.manageSupervisors
      .mutateAsync({ server: server.name, type: 'clone_process', group: process.group, process: process.name })
      .then(result => {
        if (this.checkValidResultSuccess(result)) {
          this.notificator.success(`Process ${process.name} cloned on server ${server.name}`);
        }
        this.invalidateSupervisors();
      })
      .catch(err => this.notifyErr(err));
  }

  removeProcess(server: ApiSupervisorServer, process: ApiProcess): void {
    this.manageSupervisors
      .mutateAsync({ server: server.name, type: 'remove_process', group: process.group, process: process.name })
      .then(result => {
        if (this.checkValidResultSuccess(result)) {
          this.notificator.success(`Process ${process.name} removed on server ${server.name}`);
        }
        this.invalidateSupervisors();
      })
      .catch(err => this.notifyErr(err));
  }
}
