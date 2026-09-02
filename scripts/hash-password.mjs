import { hashPassword } from '../server/security.mjs'

const password = process.argv[2]
if (!password || password.length < 12) {
  console.error('Use: node scripts/hash-password.mjs "uma-senha-com-12-ou-mais-caracteres"')
  process.exit(1)
}
console.log(hashPassword(password))
