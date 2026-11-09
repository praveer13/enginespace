/**
 * `content/course.yaml` (ARCHITECTURE §2.2, §3.1, §15): the modules in the order the course runs them, with each one's title,
 * hours and lanes.
 *
 * It names every module, written or not, so the course index and the map can list TR0 to the capstone before their files
 * exist. A written module's `module.md` repeats its title and hours, and `verify:content` holds the two to the same values.
 * The lanes are the keys of `hours_by_lane`: B is the browser, L the laptop's CPU, F a GPU (A§8.1).
 *
 * Hours are [estimated] (docs/PLAN.md §4). T07's content schemas cover the files an author writes per module; this is the
 * one file that sits above them.
 *
 * The map shows every module's prerequisites and artifacts, written or not. A module that has no `module.md` yet keeps them
 * here, from its curriculum file, and its `module.md` takes over with the same keys once it is written (W1-T06).
 */
import { z } from './zod'
import { nonBlank, uniqueList } from './common'
import { artifactSchema } from './content'
import { moduleIdSchema, prereqSchema } from './refs'

const hours = z.number().positive()

export const courseModuleSchema = z
  .strictObject({
    id: moduleIdSchema,
    title: nonBlank,
    /** [estimated] learner hours. */
    hours,
    /** The hours split by lane, which add up to `hours`. A module with no hours in a lane leaves it out. */
    hours_by_lane: z.strictObject({ B: hours.optional(), L: hours.optional(), F: hours.optional() }),
    /** Kernelspace lessons and other modules that it leans on. They advise and never lock (A§1, I9). */
    prereqs: uniqueList(prereqSchema).optional(),
    /** What the module asks the learner to build and prove, with the lane each is worked in. */
    artifacts: z.array(artifactSchema).optional(),
  })
  .superRefine((module, ctx) => {
    const lanes = module.hours_by_lane
    const total = (lanes.B ?? 0) + (lanes.L ?? 0) + (lanes.F ?? 0)
    if (total === 0) {
      ctx.addIssue({ code: 'custom', message: 'a module works in at least one lane', path: ['hours_by_lane'] })
    } else if (module.hours > 0 && Math.abs(total - module.hours) > 1e-9) {
      ctx.addIssue({ code: 'custom', message: `the lanes add up to ${total} hours, and hours says ${module.hours}`, path: ['hours_by_lane'] })
    }
    const seen = new Set<string>()
    module.artifacts?.forEach((artifact, index) => {
      if (seen.has(artifact.id)) ctx.addIssue({ code: 'custom', message: `artifact "${artifact.id}" is listed twice`, path: ['artifacts', index, 'id'] })
      seen.add(artifact.id)
    })
    module.prereqs?.forEach((prereq, index) => {
      if (prereq === module.id) ctx.addIssue({ code: 'custom', message: 'a module cannot lean on itself', path: ['prereqs', index] })
    })
  })

export const courseSchema = z
  .strictObject({
    modules: z.array(courseModuleSchema).min(1),
  })
  .superRefine((course, ctx) => {
    const seen = new Set<string>()
    course.modules.forEach((module, index) => {
      if (seen.has(module.id)) ctx.addIssue({ code: 'custom', message: `module "${module.id}" is listed twice`, path: ['modules', index, 'id'] })
      seen.add(module.id)
    })
    // A prerequisite that is not a kernelspace ref is another module of this course.
    course.modules.forEach((module, index) => {
      module.prereqs?.forEach((prereq, at) => {
        if (!prereq.startsWith('ks:') && !seen.has(prereq)) {
          ctx.addIssue({ code: 'custom', message: `"${prereq}" is not a module of this course`, path: ['modules', index, 'prereqs', at] })
        }
      })
    })
  })

export type CourseModule = z.infer<typeof courseModuleSchema>
export type Course = z.infer<typeof courseSchema>
