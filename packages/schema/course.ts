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
 */
import { z } from 'zod'
import { nonBlank } from './common'
import { moduleIdSchema } from './refs'

const hours = z.number().positive()

export const courseModuleSchema = z
  .strictObject({
    id: moduleIdSchema,
    title: nonBlank,
    /** [estimated] learner hours. */
    hours,
    /** The hours split by lane, which add up to `hours`. A module with no hours in a lane leaves it out. */
    hours_by_lane: z.strictObject({ B: hours.optional(), L: hours.optional(), F: hours.optional() }),
  })
  .superRefine((module, ctx) => {
    const lanes = module.hours_by_lane
    const total = (lanes.B ?? 0) + (lanes.L ?? 0) + (lanes.F ?? 0)
    if (total === 0) {
      ctx.addIssue({ code: 'custom', message: 'a module works in at least one lane', path: ['hours_by_lane'] })
    } else if (module.hours > 0 && Math.abs(total - module.hours) > 1e-9) {
      ctx.addIssue({ code: 'custom', message: `the lanes add up to ${total} hours, and hours says ${module.hours}`, path: ['hours_by_lane'] })
    }
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
  })

export type CourseModule = z.infer<typeof courseModuleSchema>
export type Course = z.infer<typeof courseSchema>
