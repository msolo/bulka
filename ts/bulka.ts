// FIXME(msolo) Confession time: modules in Typescript/Javascript seem
// needlessly complex. I selected two libraries to do template rendering and
// markdown parsing and copied them into /lib. These forward declarations
// provide some veneer to the rest of the application.
declare var Handlebars: any;
declare var HandlebarsException: any;
declare var marked: (md: string) => string;


class RecipeData {
  constructor(
    public filename = "",
    public data = "",
    public isModified = false
  ) { }
}

var untitleRecipeText = `# Untitled Bread

## Formula 2000g
  - Bread Flour 100.00%
  - Water 70.00%
  - Salt 2.0%
  - Yeast 0.25%
  - Diastatic Malt 0.5%

## Preferment
  - Poolish 30%

## Notes
  * Underwear goes **inside** the pants.
`;

class AppSession {
  selectedRecipeName = "";

  load() {
    let x = window.sessionStorage.getItem("selectedRecipeName");
    if (x) {
      this.selectedRecipeName = x;
    }
  }

  store() {
    window.sessionStorage.setItem(
      "selectedRecipeName",
      this.selectedRecipeName
    );
  }
}

class AppData {
  catalogUrl = "data/";
  currentRecipe?: RecipeTemplate;
  fileMap: Map<string, RecipeData> = new Map();
  recipeMap: Map<string, RecipeTemplate> = new Map();
  outstandingFetchCount = 0;

  onDataLoaded?: (d: AppData) => void;

  fetchCatalog() {
    remoteLoad(this.catalogUrl, (data) => {
      let fl = data.trim().split("\n");
      for (let f of fl) {
        if (f.endsWith(".mdr")) {
          this.outstandingFetchCount++;
          this.fetchFile(f);
        }
      }
    });
  }

  // Load remote file into the fileMap.
  fetchFile(fname: string) {
    let url = this.catalogUrl + fname;
    remoteLoad(url, (data) => {
      let rd = new RecipeData(fname, data);

      try {
        let rt = RecipeTemplate.parse(rd);
        this.addRecipe(rt);
      } catch (e) {
        console.error("error parsing recipe " + fname + ": " + e);
      }

      this.outstandingFetchCount--;
      if (this.outstandingFetchCount == 0) {
        if (this.onDataLoaded) {
          this.onDataLoaded(this);
        }
      } else if (this.outstandingFetchCount < 0) {
        console.error(
          "programmer error: negative outstandingFetchCount " +
          this.outstandingFetchCount
        );
      }
    });
  }

  saveFile(rd: RecipeData, callback: () => void) {
    let url = this.catalogUrl + rd.filename;
    remoteStore(url, rd.data, () => {
      rd.isModified = false;
      if (callback) {
        callback();
      }
    });
  }

  addRecipe(r: RecipeTemplate) {
    if (!r.recipeData) {
      throw new Error("no filename provided for recipe: " + r.name);
    }
    this.fileMap.set(r.recipeData.filename, r.recipeData);
    this.recipeMap.set(r.name, r);
  }

  removeRecipe(r: RecipeTemplate) {
    if (!r.recipeData) {
      throw new Error("no filename provided for recipe: " + r.name);
    }
    this.fileMap.delete(r.recipeData.filename);
    this.recipeMap.delete(r.name);
  }

  recipeList(): RecipeTemplate[] {
    let rl = Array.from(this.recipeMap.values());
    rl.sort(function sortByName(a: RecipeTemplate, b: RecipeTemplate) {
      let aName = a.name.toLowerCase();
      let bName = b.name.toLowerCase();
      if (aName < bName) {
        return -1;
      }
      if (aName > bName) {
        return 1;
      }
      return 0;
    });
    return rl;
  }

  init() {
    this.fetchCatalog();
  }
}

class TemplateData {
  constructor(
    public recipe?: RecipeTemplate,
    public recipeList: RecipeTemplate[] = []
  ) { }
}

class AppController {
  templateCache: { [key: string]: (x: object) => string } = {};

  constructor(
    private data: AppData,
    private session: AppSession,
    private textareaId: string,
    private mode = "view"
  ) { }

  onSelectRecipe(name: string) {
    this.selectRecipe(name);
  }

  onNew() {
    let rd = new RecipeData(
      "recipe-" + Date.now() + ".mdr",
      untitleRecipeText,
      true
    );
    let rt = RecipeTemplate.parse(rd);
    this.data.addRecipe(rt);
    this.selectRecipe(rt.name);
    this.onEdit();
  }

  onFileList() {
    this.mode = "filelist";
    this.showTab("tab-filelist");
    this.handleToolbar();
  }

  onHideFileList() {
    this.mode = "view";
    this.showTab("tab-view");
    this.handleToolbar();
  }

  onEdit() {
    this.mode = "edit";
    this.showTab("tab-edit");
    this.handleToolbar();
  }

  getNewRecipeData(): string {
    let selector = "#" + this.textareaId;
    let textarea = document.querySelector<HTMLTextAreaElement>(selector);
    if (!textarea) {
      throw new Error("undefined textarea for selector: " + selector);
    }
    return textarea.value;
  }

  onEditCancel() {
    let data = this.getNewRecipeData();
    if (data == untitleRecipeText) {
      // If this is untitled, just remove the doc.
      this.data.removeRecipe(this.data.currentRecipe!);
      // Select the first recipe so we have something to look at.
      return this.selectRecipe(this.data.recipeList()[0].name);
    }

    this.mode = "view";
    this.showTab("tab-view");
    this.handleToolbar();
  }

  onEditDone() {
    let data = this.getNewRecipeData();

    let rd = this.data.currentRecipe?.recipeData;
    if (!rd) {
      throw new Error("undefined recipeData");
    }

    // Just bail if no changes were made.
    if (rd.data == data) {
      return this.onEditCancel();
    }

    rd.data = data;
    rd.isModified = true;

    try {
      let newRecipe = RecipeTemplate.parse(rd);
      this.data.removeRecipe(this.data.currentRecipe!);
      this.data.addRecipe(newRecipe);

      newRecipe.scaleRecipe();
      this.data.currentRecipe = newRecipe;

      this.data.saveFile(rd, () => {
        // When we finally do save, refresh the nav.
        this._renderNav();
      });
    } catch (e) {
      window.alert("error in recipe: " + e);
    }

    this.renderViewRecipe();
  }

  onAbout() {
    let version = window.location;
    alert(
      "A simple recipe scaler for amateur panaderos.\n\nVersion:" + version
    );
  }

  onReload() {
    let l = window.location;
    let x = l.origin + l.pathname + "?dev=1&nocache=" + Date.now();
    if (confirm("Force application reload? This will break offline.")) {
      window.location.replace(x.toString());
    }
  }

  // shouldDisplayInstallMessage(): boolean {
  //   // Detects if device is on iOS
  //   const isIos = () => {
  //     const userAgent = window.navigator.userAgent.toLowerCase();
  //     return /iphone|ipad|ipod/.test(userAgent);
  //   }
  //   // Detects if device is in standalone mode
  //   const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

  //   // Checks if should display install popup notification:
  //   return isIos() && !isInStandaloneMode();
  // }

  onInstall() {
    let l = window.location;
    let pathname = l.pathname;
    if (!pathname.endsWith(".html")) {
      pathname += "bulka.html";
    }
    let x = l.origin + pathname + "?version=" + Date.now();
    if (
      confirm(
        'Prepare application for installation?\n\nYou will still have to manually select "Add to Home Screen".'
      )
    ) {
      window.location.replace(x.toString());
    }
    return false;
  }

  // Select a recipe by name and trigger a content update.
  selectRecipe(name: string) {
    if (!name) {
      name = this.data.recipeList()[0].name;
    }
    let rt = this.data.recipeMap.get(name);
    if (!rt) {
      // We have a bad name somehow - revert to the first selection:
      name = this.data.recipeMap.keys().next().value;
      rt = this.data.recipeMap.get(name);
    }
    this.session.selectedRecipeName = name;
    this.session.store();

    rt?.scaleRecipe();
    this.data.currentRecipe = rt;

    this.renderViewRecipe();
  }

  _renderNav() {
    let td = new TemplateData(this.data.currentRecipe, this.data.recipeList());
    mustGetElementById<HTMLElement>("nav").innerHTML = this.renderTemplate(
      "nav-tmpl",
      td
    );
    mustGetElementById<HTMLElement>("tab-filelist").innerHTML = this.renderTemplate("tab-filelist-tmpl", td);
    this.handleToolbar();
  }

  renderViewRecipe() {
    this.mode = "view";
    this.renderRecipe();
    this.showTab("tab-view");
    this._renderNav();
    this.handleToolbar();
  }

  renderEditRecipe() {
    this.mode = "edit";
    this.showTab("tab-edit");
  }

  renderRecipe() {
    let td = new TemplateData(this.data.currentRecipe, this.data.recipeList());
    let html = this.renderTemplate("tab-view-tmpl", td);
    if (!this.data.currentRecipe) {
      console.warn("no current recipe");
    }
    mustGetElementById<HTMLElement>("tab-view").innerHTML = html;
    mustGetElementById<HTMLElement>("tab-edit").innerHTML = this.renderTemplate("tab-edit-tmpl", td);
  }

  renderTemplate(templateId: string, data: TemplateData) {
    if (this.templateCache[templateId]) {
      return this.templateCache[templateId](data);
    }
    let node = mustGetElementById<HTMLElement>(templateId);
    let template = Handlebars.compile(node.innerHTML);
    this.templateCache[templateId] = template;
    return template(data);
  }

  updateSchedule(item: number) {
    let d = new Date();
    let startTime = d.getHours() * 60 + d.getMinutes();
    console.log("updateSchedule:" + startTime, this.data.currentRecipe);
    this.data.currentRecipe?.schedule?.fixDurations(item, startTime);
    this.renderViewRecipe();
  }

  showTab(id: string) {
    // Get all elements with class="tabcontent" and hide them.
    if (!isTablet() || (isTablet() && id != "tab-filelist")) {
      for (let e of document.querySelectorAll<HTMLElement>(".tab-content")) {
        e.classList.remove("visible");
      }
    }

    // Correctly reset scroll after we change tab content.
    console.log("showTab", this.mode, id);
    if (!id.endsWith(this.mode)) {
      this.resetScroll();
    }
    // Show the current tab.
    document.getElementById(id)!.classList.add("visible");
  }

  resetScroll() {
    // Correctly reset scroll for the main scollable element.
    document.querySelector('.tab-content.visible')!.scrollTo({ top: 0 });
  }

  handleToolbar() {
    let mode = this.mode;

    let allElements = ["button-hide-sidebar", "button-filelist", "button-done", "label-filelist", "label-recipe", "button-menu", "button-edit", "button-cancel"];
    let activeElements = ["button-hide-sidebar", "button-menu"];
    if (isTablet()) {
      activeElements.push("button-edit");
      activeElements.push("label-recipe");
    } else {
      activeElements.push("label-filelist");
    }
    if (mode == "edit") {
      activeElements = ["button-done", "label-recipe", "button-cancel"];
    } else if (mode == "view") {
      activeElements = ["button-filelist", "label-recipe", "button-menu", "button-edit"];
    }
    for (let e of allElements) {
      let display = "none";
      if (activeElements.includes(e)) {
        display = "inline";
      }
      let b = document.querySelector<HTMLButtonElement>("#" + e);
      if (b) {
        b.style.display = display;
      }
    }
  }
}

function isTablet(): boolean {
  const match = window.matchMedia('(min-width: 630px)');
  return match && match.matches;
}

function isMobile(): boolean {
  const match = window.matchMedia('(pointer:coarse)');
  return match && match.matches;
}

function mustGetElementById<T>(id: string): T {
  let x = document.getElementById(id);
  if (!x) {
    throw Error("missing DOM node id=" + id);
  }
  return x as unknown as T;
}

function remoteLoad(url: string, callback: (data: string) => void) {
  let xhr = new XMLHttpRequest();

  xhr.onload = function (e: ProgressEvent) {
    if (xhr.status == 200) {
      let data = this.responseText;
      callback(data);
    } else {
      console.error("failed to load file: " + url);
    }
  };

  xhr.onerror = function (e: ProgressEvent) {
    console.error("failed to load file: " + url);
  };

  xhr.responseType = "text";
  xhr.timeout = 2 * 1000;

  xhr.open("GET", url);
  xhr.send(null);
}

function remoteStore(url: string, data: string, callback: () => void) {
  let xhr = new XMLHttpRequest();

  xhr.onload = function (e: ProgressEvent) {
    if (xhr.status == 201 || xhr.status == 204) {
      // give some feedback?
      callback();
    } else {
      window.alert("file save failed: " + url);
    }
  };

  xhr.onerror = function (e: ProgressEvent) {
    window.alert("file save failed: " + url);
  };

  xhr.timeout = 2 * 1000;
  xhr.responseType = "text";

  xhr.open("PUT", url);
  xhr.send(data);
}

Handlebars.registerHelper("format_grams", function (g: number) {
  if (g < 10) {
    return g.toLocaleString("en-US", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
  }
  return Math.round(g).toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
});

Handlebars.registerHelper("format_schedule_time", function (g: number) {
  let minutes = g % 60;
  let hours = Math.floor(g / 60);
  return (
    hours.toLocaleString("en-US", {
      minimumIntegerDigits: 2,
      maximumFractionDigits: 0,
    }) +
    ":" +
    minutes.toLocaleString("en-US", { minimumIntegerDigits: 2 })
  );
});

Handlebars.registerHelper("format_percentage", function (p: number) {
  return p.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
});

Handlebars.registerHelper("eq", (a: any, b: any) => a == b);

var controller: AppController;

function main() {
  let appSession = new AppSession();
  appSession.load();
  let appData = new AppData();
  controller = new AppController(appData, appSession, "raw-data");
  appData.onDataLoaded = function (appData: AppData) {
    controller.selectRecipe(appSession.selectedRecipeName);
  };
  appData.init();
}
main();
