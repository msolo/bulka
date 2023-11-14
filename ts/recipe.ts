
class Ingredient {
  constructor(
    public name: string,
    public percent: number,
    public amountGrams: number = 0.0
  ) { }
}

class Schedule {
  constructor(public items: ScheduleItem[], public startTime = 0) { }
  fix(start: number = 0) {
    if (start) {
      this.startTime = start;
    }
    for (let i = this.items.length - 2; i >= 0; i--) {
      let x = this.items[i + 1];
      let y = this.items[i];
      this.items[i].durationMinutes = x.startTimeMinutes - y.startTimeMinutes;
    }
    this.fixDurations();
  }
  fixDurations(itemIdx: number = 0, startTimeMinutes: number = 0) {
    this.items[itemIdx].startTimeMinutes = startTimeMinutes || this.startTime;
    for (let i = itemIdx; i < this.items.length - 1; i++) {
      let x = this.items[i];
      let y = this.items[i + 1];
      y.startTimeMinutes = x.startTimeMinutes + x.durationMinutes;
    }
  }
}

class ScheduleItem {
  constructor(
    public startTimeMinutes: number,
    public durationMinutes: number,
    public description: string
  ) { }
}

class Formula {
  constructor(public name: string, public ingredients: Ingredient[]) { }
  totalPercent(): number {
    let sum = 0.0;
    for (let i of this.ingredients) {
      sum += i.percent;
    }
    return sum;
  }
}

class Preferment extends Formula {
  scaleYeastByTime = true;
  // Create a formula-specific preferment.
  // This assumes that a bread formula lists it's flour type as the first ingredient.
  makePrefermentForFormula(formula: Formula, fermentTime: string): Formula {
    let ing = [new Ingredient(formula.ingredients[0].name, 100)];
    for (let i of this.ingredients) {
      let x = new Ingredient(i.name, i.percent);
      if (i.name.toLowerCase().includes("yeast") && this.scaleYeastByTime) {
        x.percent = prefermentTimeYeastPercentMap[fermentTime];
      }
      ing.push(x);
    }
    return new Formula(this.name, ing);
  }
}

var prefermentTimeYeastPercentMap: { [key: string]: number } = {
  "3 hrs": 0.6,
  "8 hrs": 0.3,
  "12 hrs": 0.1,
};

const PrefermentedDough = new Preferment("Prefermented Dough", [
  new Ingredient("Water", 65.0),
  new Ingredient("Salt", 2.0),
  new Ingredient("Yeast", 0.6),
]);
PrefermentedDough.scaleYeastByTime = false;

const Poolish = new Preferment("Poolish", [
  new Ingredient("Water", 100.0),
  new Ingredient("Yeast", 0.6),
]);

const Sponge = new Preferment("Sponge", [
  new Ingredient("Water", 60.0),
  new Ingredient("Yeast", 0.6),
]);

const Biga = new Preferment("Biga", [
  new Ingredient("Water", 50.0),
  new Ingredient("Yeast", 0.6),
]);

var prefementList = [null, Poolish, Sponge, PrefermentedDough, Biga];

class RecipeTemplate {
  finalFormula?: Formula;
  prefermentFormula?: Formula;
  recipeData?: RecipeData;
  name: string = "";

  constructor(
    public formula: Formula,
    public notes: string = "",
    public quantityGrams: number = 500,
    public preferment?: Preferment,
    public prefermentPercent: number = 0,
    public prefermentTime: string = "12 hrs",
    public schedule?: Schedule
  ) {
    this.name = formula.name;
    this.notes = marked(notes);
    if (preferment) {
      this.prefermentFormula = preferment.makePrefermentForFormula(
        formula,
        prefermentTime
      );
    }
  }

  static parse(rd: RecipeData): RecipeTemplate {
    let rt = this.parseData(rd.data);
    rt.recipeData = rd;
    return rt;
  }

  static parseData(data: string): RecipeTemplate {
    let formula: Formula | undefined;
    let quantityGrams = 500;
    let name = "";
    let notes = "";
    let prefermentName = "";
    let prefermentPercent = 0;
    let ingredients: Ingredient[] = [];
    let schedule: Schedule | undefined;

    let lines = data.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      let line = lines[i].trim();
      if (line.startsWith("# ")) {
        name = line.substr(2);
      } else if (line.startsWith("## Formula")) {
        let words = line.split(" ");
        if (words.length == 3) {
          let amountStr = words[words.length - 1];
          if (amountStr.endsWith("g")) {
            amountStr = amountStr.substr(0, amountStr.length - 1);
          }
          quantityGrams = parseFloat(amountStr);
        }

        for (let j = i + 1; j < lines.length; j += 1) {
          line = lines[j].trim();
          if (line.startsWith("- ")) {
            let words = line.split(" ");
            let percent = words[words.length - 1];
            if (!percent.endsWith("%")) {
              throw Error(
                "malformatted ingredient baker's percent: " + percent
              );
            }
            percent = percent.substr(0, percent.length - 1);
            let iname = words.slice(1, -1).join(" ");
            ingredients.push(new Ingredient(iname, parseFloat(percent)));
          } else if (!line) {
            i = j;
            break;
          }
        }
        formula = new Formula(name, ingredients);
      } else if (line.startsWith("## Preferment")) {
        for (let j = i + 1; j < lines.length; j += 1) {
          line = lines[j].trim();
          if (line.startsWith("- ")) {
            let words = line.split(" ");
            let percent = words[words.length - 1];
            if (!percent.endsWith("%")) {
              throw Error("malformatted preferment percent: " + percent);
            }
            prefermentPercent = parseFloat(
              percent.substr(0, percent.length - 1)
            );
            prefermentName = words.slice(1, -1).join(" ");
          } else if (!line) {
            i = j;
            break;
          }
        }
      } else if (line.startsWith("## Schedule")) {
        let schedItems = [];
        let schedStart = 0;
        for (let j = i + 1; j < lines.length; j += 1) {
          line = lines[j].trim();
          if (line.startsWith("- ")) {
            let words = line.split(" ");
            let startTime = words[1];
            let readSchedStart = false;
            if (startTime.startsWith("@")) {
              readSchedStart = true;
              startTime = startTime.substr(1);
            }
            let match = startTime.match("(\\d+):(\\d+)");
            if (match == null) {
              throw Error("malformatted schedule time: " + startTime);
            }
            let hours = parseInt(match[1], 10);
            let minutes = parseInt(match[2], 10);
            let totalMinutes = hours * 60 + minutes;
            if (readSchedStart) {
              schedStart = totalMinutes;
            } else {
              let desc = words.slice(2).join(" ");
              schedItems.push(new ScheduleItem(totalMinutes, 0, desc));
            }
          } else if (!line) {
            schedule = new Schedule(schedItems, schedStart);
            schedule.fix();
            i = j;
            break;
          }
        }
      } else if (line.startsWith("## Notes")) {
        notes = lines.slice(i).join("\n");
        if (schedule != undefined) {
          break;
        }

        let schedItems = [];
        let noteLines = [];
        for (let j = i + 1; j < lines.length; j += 1) {
          line = lines[j].trim();
          if (line.startsWith("### ")) {
            // ### Step name 00:15
            // Infer a step that takes 15 minutes.
            // ### Step name -00:30
            // Infer a step that takes 30 minutes, but must finish before the next step.
            // how do you handle multiple items like this? I'm not sure it composes.
            // implicitly, we say items must proceed sequentially. encoding parallel workfllows
            // is more complicated and you can thing of it as a graph.
            let words = line.split(" ");
            let duration = words[words.length - 1];

            let match = duration.match("(\\d+):(\\d+)");
            if (match != null) {
              let hours = parseInt(match[1], 10);
              let minutes = parseInt(match[2], 10);
              let durationMinutes = hours * 60 + minutes;
              let desc = words.slice(1, -1).join(" ");
              schedItems.push(new ScheduleItem(0, durationMinutes, desc));
              line = words.slice(0, -1).join(" ");
            }
          }
          noteLines.push(line);
        }
        notes = noteLines.join("\n");
        if (schedItems.length > 0) {
          schedule = new Schedule(schedItems);
          schedule.fixDurations();
        }
        break;
      }
    }
    let prefermentFormula: Preferment | undefined = undefined;
    if (prefermentName) {
      for (let x of prefementList) {
        if (x && x.name == prefermentName) {
          prefermentFormula = x;
        }
      }
    }
    if (!formula) {
      throw new Error("invalid recipe file");
    }
    let r = new RecipeTemplate(
      formula,
      notes,
      quantityGrams,
      prefermentFormula,
      prefermentPercent,
      undefined,
      schedule
    );
    return r;
  }

  scaleRecipe(quantityGrams = 0) {
    if (quantityGrams) {
      this.quantityGrams = quantityGrams;
    }
    if (this.preferment) {
      this.prefermentFormula = this.preferment.makePrefermentForFormula(
        this.formula,
        this.prefermentTime
      );
    }

    let totalPrefermentGrams = 0;

    let prefermentMassMap: { [key: string]: number } = {};

    if (this.prefermentFormula) {
      totalPrefermentGrams =
        (this.quantityGrams * this.prefermentPercent) / 100.0;

      for (let i of this.prefermentFormula.ingredients) {
        i.amountGrams =
          (i.percent * totalPrefermentGrams) /
          this.prefermentFormula.totalPercent();
        prefermentMassMap[i.name] = i.amountGrams;
      }
    }

    let finalIngredients: Ingredient[] = [];

    if (this.prefermentFormula) {
      finalIngredients.push(
        new Ingredient(this.prefermentFormula.name, 0.0, totalPrefermentGrams)
      );
    }
    for (let i of this.formula.ingredients) {
      let mass = (i.percent * this.quantityGrams) / this.formula.totalPercent();
      mass -= prefermentMassMap[i.name] || 0.0;
      finalIngredients.push(new Ingredient(i.name, i.percent, mass));
    }
    this.finalFormula = new Formula("Final Formula", finalIngredients);

    for (let i of this.formula.ingredients) {
      i.amountGrams =
        (i.percent * this.quantityGrams) / this.formula.totalPercent();
    }
    return this;
  }
}