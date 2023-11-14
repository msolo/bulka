# Bulka - A Calculator for Bread

This is a small personal project to produce and scale bread recipes based on augmented Markdown files. Obviously this is an engineering approach to bread and not to be confused with consumer-friendly software.

In some ways this is also an excercise in how to do the least amount of work humanly possible and still end up with a functional application that looks decent.

# Building

Compile the Typescipt code:
```
tsc
```

Build a docker image to run the server side:
```
docker build -t bulka:latest .
```

# Running

Start a the local python web server in the container:
```
./run.sh --allow-unauthenticated-writes
```

The server defaults to denying PUT requests, so enable this explicitly if you want to try it out.

# Design

There are a few notes in [docs/Design.md](docs/Design.md) that explain a bit about the code and design decisions.

# An Annotated Example Recipe

```
# Demo Recipe

## Formula 2200g
 - Bread Flour 100.00%
 - Water 70.00%
 - Salt 2.0%
 - Yeast 0.25%
 - Diastatic Malt 0.5%
 - Blargo™ brand Premium White Spreading Lard 10%

## Preferment
 - Poolish 30%


## Schedule
 - @9:30 start
 - 11:00 Start measuring and mixing dough.
 - 11:20 Turn dough into greased fermenting tub and proof in oven (someplace 75°F).
 - 12:20 Turn dough with a light fold.
 - 12:50 Divide dough and perform initial shaping.
 - 13:05 Start resting dough.
 - 13:30 Start final shaping.
 - 13:45 Start final proof; start heating oven.
 - 14:45 Score and start first batch.
 - 15:10 Score and start last batch.
 - 15:35 Finished.

## Notes

Generic notes about the techniques go here.

So does a log of tweaks/fixes/failures.

```

# Special Fields

Some part of the markdown file have stricter formats so they can be parsed and interpreted by the program.

```
# Demo Recipe
```

The only # heading is considered the name of the recipe.

## Formula Notes
```
## Formula 2200g
```

This adjusts the total amount of dough you want to make.

```
 - Ingredient 10.0%
```
The rest of the formula is expressed in Bakers' Percentage - the percentage must be the last part of the item.

## Preferment Notes

```
## Preferment
 - Poolish 30%
```

This optional section lets you adjust the process based on some templates. The strategy must be one of the following:
 * Biga
 * Poolish
 * Prefermented Dough
 * Sponge

These have preset formulas and assume that this is a 12-hour, room temperature ferment.

The percentage here is a true percentage of the total amount of final dough. There is no standard notation amongst different recipes. For instance, *Bread Baker's Apprentice* expresses preferment as an ingredient in Bakers' %. However, *SFBI* generates formulas based on a true percentage of flour; a baguette with 25% poolish with have 25% of its flour in the preferment. Practically speaking, everything involves some translation and it's not clear than any specific approach is superior.

## Schedule Notes

These items can be based on 24-hour times. The special `@9:30 start` directive will reset all the intervals for a new start time.

When reading the recipe, clicking the stopwatch ⏱will reset the time for a particular step and recalculate the next times. Bread is an organic process, so approximate timing it perfectly adequate.

```
## Schedule
 - @9:30 start
 - 11:00 Start measuring and mixing dough.
 - 11:20 Turn dough into greased fermenting tub and proof in oven (someplace 75°F).
 - 12:20 Turn dough with a light fold.
 - 12:50 Divide dough and perform initial shaping.
 - 13:05 Start resting dough.
 - 13:30 Start final shaping.
 - 13:45 Start final proof; start heating oven.
 - 14:45 Score and start first batch.
 - 15:10 Score and start last batch.
 - 15:35 Finished.
```

## Notes

The `## Notes` section is free-form Markdown section at this point. Anything here is rendered out as-is.


