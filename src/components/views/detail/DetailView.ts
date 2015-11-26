/// <reference path="../../interface/teambition.d.ts" />
module teambition {
  'use strict';

  interface IImagesData {
    data: File;
    url: string;
  }

  const objectTpls = {
    task: {
      title: '任务详情',
      name: '任务'
    },
    post: {
      title: '分享详情',
      name: '分享'
    },
    event: {
      title: '日程详情',
      name: '日程'
    },
    work: {
      title: '文件详情',
      name: '文件'
    },
    entry: {
      title: '记账详情',
      name: '记账'
    }
  };

  let popup: ionic.popup.IonicPopupPromise;
  let boundToObjectId: string;
  let actionSheet: any;

  @inject([
    'DetailAPI',
    'ActivityAPI',
    'ProjectsAPI',
    'MemberAPI',
    'EntryAPI',
    'WorkAPI',
    'LikeAPI',
    'StrikerAPI'
  ])
  class DetailView extends View {

    public ViewName = 'DetailView';

    public title: string;
    public fixWebkit = false;
    public comment: string;
    public project: IProjectDataParsed;
    public projectMembers: {
      [index: string]: IMemberData
    };

    protected _boundToObjectId: string;
    protected _boundToObjectType: string;
    protected _linkedId: string;
    protected detail: any;

    private DetailAPI: IDetailAPI;
    private ActivityAPI: IActivityAPI;
    private StrikerAPI: IStrikerAPI;
    private ProjectsAPI: IProjectsAPI;
    private WorkAPI: IWorkAPI;
    private EntryAPI: IEntryAPI;
    private LikeAPI: ILikeAPI;
    private MemberAPI: IMemberAPI;
    private images: IImagesData[];

    // @ngInject
    constructor(
      $scope: angular.IScope
    ) {
      super();
      this.$scope = $scope;
      this.comment = '';
      this.images = [];
      this.zone.run(noop);
    }

    public onInit(): angular.IPromise<any> {
      this._boundToObjectId = this.$state.params._id;
      this._boundToObjectType = this.$state.params.type;
      this._linkedId = this.$state.params.linkedId;
      if (boundToObjectId === this._boundToObjectId) {
        return;
      }
      if (this._boundToObjectType !== 'entry') {
        return this.DetailAPI.fetch(this._boundToObjectId, this._boundToObjectType, this._linkedId)
        .then((detail: any) => {
          this.detail = detail;
          return this.$q.all([
            this.MemberAPI.fetch(detail._projectId)
            .then((members: {[index: string]: IMemberData}) => {
              this.projectMembers = members;
            }),
            this.ProjectsAPI.fetchById(detail._projectId)
            .then((project: IProjectDataParsed) => {
              this.project = project;
            })
          ]);
        });
      }else {
        return this.EntryAPI.fetch(this._boundToObjectId)
        .then((data: IEntryData) => {
          this.detail = data;
          return data;
        });
      }
    }

    public onAllChangesDone() {
      this.title = objectTpls[this._boundToObjectType].title;
      if (Ding) {
        Ding.setLeft('返回', true, true, () => {
          if (window.history.length > 2) {
            window.history.back();
          }else {
            let type = this._boundToObjectType;
            type = type === 'task' ? 'tasklist' : type;
            window.location.hash = `/project/${this.project._id}/${type}`;
          }
        });
        Ding.setRight('更多', true, false, () => {
          this.showOptions();
        });
      }
    }

    public showLikes() {
      popup = this.$ionicPopup.show({
        templateUrl: 'detail/likes/index.html',
        scope: this.$scope
      });
      this.fixWebkit = true;
    }

    public hideLikes() {
      popup.close();
      this.fixWebkit = false;
    }

    public loadImages (images: IImagesData[]) {
      this.images = this.images.concat(images);
    }

    public removeImage($index: number) {
      let item = this.images.splice($index, 1)[0];
      URL.revokeObjectURL(item.url);
    }

    public hasContent() {
      return !!(this.images.length || this.comment.length);
    }

    public like() {
      if (!this._boundToObjectType) {
        return;
      }
      return this.LikeAPI.postLike(
        this.detail
      );
    }

    public openLinked() {
      if (this.detail.linked) {
        window.location.hash = `/detail/${this._boundToObjectType}/${this._boundToObjectId}/link`;
      }
    }

    public addComment() {
      if (!this.comment && !this.images.length) {
        return ;
      }
      this.showLoading();
      let _projectId = this.detail._projectId;
      if (!this.images.length) {
        return this.addTextComment()
        .then(() => {
          this.hideLoading();
        });
      }else {
        let files = this.images.map((item: {data: File}) => {
          return item.data;
        });
        let strikerRes: IStrikerRes[];
        return this.StrikerAPI.upload(files)
        .then((data: any) => {
          if (data) {
            if (data.length) {
              strikerRes = data;
            }else {
              strikerRes = [data];
            }
          }else {
            strikerRes = [];
          }
        })
        .then(() => {
          return this.ProjectsAPI.fetchById(_projectId);
        })
        .then((project: IProjectDataParsed) => {
          let collectionId = project._defaultCollectionId;
          return this.WorkAPI.uploads(collectionId, _projectId, strikerRes);
        })
        .then((resp: IFileDataParsed[]) => {
          let attachments = [];
          angular.forEach(resp, (file: IFileDataParsed, index: number) => {
            attachments.push(file._id);
          });
          return attachments;
        })
        .then((attachments: string[]) => {
          return this.addTextComment(attachments);
        })
        .catch((reason: any) => {
          this.hideLoading();
        });
      }
    }

    public openEdit(name: string) {
      window.location.hash = `/detail/${this._boundToObjectType}/${this._boundToObjectId}/${name}`;
    }

    public getInvolves() {
      if (this.detail) {
        let involves = [];
        angular.forEach(this.detail.members, (member: IMemberData) => {
          involves.push(member.name);
        });
        return involves.join('、');
      }
    }

    public removeObject() {
      this.DetailAPI.delete(this._boundToObjectType, this._boundToObjectId)
      .then(() => {
        window.history.back();
        this.showMsg('success', '删除成功', '');
      })
      .catch((reason: any) => {
        let message = this.getFailureReason(reason);
        this.showMsg('error', '删除失败', message);
      });
    }

    public previewFile() {
      Ding.previewImages([this.detail.downloadUrl]);
    }

    private addTextComment(attachments?: string[]) {
      attachments = (attachments && attachments.length) ? attachments : [];
      return this.ActivityAPI.save({
        _boundToObjectId: this._boundToObjectId,
        attachments: attachments,
        boundToObjectType: this._boundToObjectType,
        content: this.comment
      })
      .then(() => {
        this.comment = '';
        this.images = [];
        this.hideLoading();
      })
      .catch((reason: any) => {
        let msg = '网络错误';
        msg = (reason && typeof(reason.data) === 'object') ? reason.data.message : msg;
        this.showMsg('error', '评论失败', msg);
        this.hideLoading();
      });
    }

    private openContact() {
      let defer = this.$q.defer();
      Ding.openConcatChoose(true, null, (data: Ding.IDingMemberData[]) => {
        let users = [];
        angular.forEach(data, (user: Ding.IDingMemberData) => {
          users.push(user.emplId);
        });
        defer.resolve(users);
      });
      return defer.promise;
    }

    private openDing() {
      this.openContact().then((users: string[]) => {
        let name: string;
        let title = objectTpls[this._boundToObjectType].title;
        switch (this._boundToObjectType) {
          case 'task':
            name = this.detail.content;
            break;
          case 'post':
          case 'event':
            name = this.detail.title;
            break;
          case 'work':
            name = this.detail.fileName;
            break;
        };
        let link = `${host}/${window.location.search}#/detail/${this._boundToObjectType}/${this._boundToObjectId}`;
        Ding.createDing(users, link, title, name);
      });
    }

    private openCall() {
      this.openContact().then((users: string[]) => {
        Ding.createCall(users);
      });
    }

    private pickConversation() {
      Ding.pickConversation();
    }

    private showOptions() {
      if (actionSheet) {
        actionSheet = actionSheet();
      }else {
        actionSheet = this.$ionicActionSheet.show({
          buttons: [{
            text: 'Ding 一下'
          }, {
            text: '语音通话'
          }, {
            text: '发送到聊天'
          }, {
            text: `<font color="red">删除${objectTpls[this._boundToObjectType].name}</font>`
          }],
          cancelText: '取消',
          buttonClicked: (index: number) => {
            switch (index) {
              case 0:
                this.openDing();
                break;
              case 1:
                this.openCall();
                break;
              case 2:
                this.pickConversation();
                break;
              case 3:
                this.removeObject();
                break;
            }
            return true;
          }
        });
      }
    }

  }

  angular.module('teambition').controller('DetailView', DetailView);
}
