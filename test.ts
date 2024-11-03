
import { LZString } from "./src/utils/lzstring"
import { TrueSkill, Rating as TrueskillRating } from 'ts-trueskill'

import rate from "glicko2-lite"


// const ratings = []
// let r = rate(1500, 350, 0.1, [[1500, 350, 1]])
// ratings.push(r.rating)
// r = rate(r.rating, r.rd, r.vol, [[1500, 350, -1]])
// ratings.push(r.rating)
// r = rate(r.rating, r.rd, r.vol, [[1500, 350, 1]])
// ratings.push(r.rating)

// console.log(ratings, r.rd, r.vol)



const env = new TrueSkill()

console.log(env)
