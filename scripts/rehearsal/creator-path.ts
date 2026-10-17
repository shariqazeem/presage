// Rehearsal only: drive the deploy-your-own-agent flow through the web API the way the browser does.
import '../../engine/env'
if (process.env.CALLED_REHEARSAL !== '1') throw new Error('Rehearsal script: set CALLED_REHEARSAL=1 against a local fork')
const { createWalletClient, http, parseEventLogs } = await import('viem')
const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts')
const { metis } = await import('viem/chains')
const { identityRegistryAbi } = await import('../../lib/abi/erc8004')
const { calledAgentsAbi } = await import('../../lib/abi/CalledAgents')
const { publicClient, deployment, erc8004 } = await import('../../lib/chain')
const { TEMPLATES } = await import('../../lib/spec/templates')
const { runCreatorAgents } = await import('../../engine/creators')

const site = 'http://localhost:3456'
const account = privateKeyToAccount(generatePrivateKey())
await publicClient.request({ method: 'anvil_setBalance' as never, params: [account.address, '0xDE0B6B3A7640000'] as never })
const wallet = createWalletClient({ account, chain: metis, transport: http('http://127.0.0.1:8545') })
console.log(`creator ${account.address} (fork only)`)

// 1. Sign in with the wallet.
const { message } = await (await fetch(`${site}/api/session?address=${account.address}`)).json()
const signature = await account.signMessage({ message })
const si = await fetch(`${site}/api/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account.address, message, signature }) })
const cookie = si.headers.get('set-cookie')!.split(';')[0]
console.log(`1. signed in → ${(await si.json()).wallet}`)

// 2. Take the first template on four majors and see what it sees right now.
const t = TEMPLATES[0]
const spec = { ...t.spec, markets: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'METISUSDT'] }
const check = await (await fetch(`${site}/api/build/check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }) })).json()
console.log(`2. rules: ${check.described.rules[0].slice(0, 110)}…`)
for (const r of check.results) console.log(`   ${r.symbol.padEnd(6)} ${r.fires ? 'WOULD CALL' : 'waiting   '} ${r.checks.map((c: { ok: boolean; saw: string }) => (c.ok ? '✓ ' : '· ') + c.saw).join(' | ').slice(0, 150)}`)

// 3. Save the draft, mint the identity, seal the spec, list the agent.
const draft = await (await fetch(`${site}/api/build/draft`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Trendline Sniper', description: 'Rehearsal agent.', prompt: t.prompt, spec, priceUsd6: 3_000_000 }) })).json()
console.log(`3. draft ${draft.slug}, spec ${draft.specHash.slice(0, 12)}…, card ${draft.agentURI}`)
const mint = await publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract({ address: erc8004.identity, abi: identityRegistryAbi, functionName: 'register', args: [draft.agentURI], type: 'legacy' }) })
const id = parseEventLogs({ abi: identityRegistryAbi, eventName: 'Registered', logs: mint.logs })[0].args.agentId
const sealHash = await wallet.writeContract({ address: deployment!.agents, abi: calledAgentsAbi, functionName: 'register', args: [id, 2, draft.specHash, draft.specURI, 3_000_000n, 0n], type: 'legacy' })
await publicClient.waitForTransactionReceipt({ hash: sealHash })
const fin = await (await fetch(`${site}/api/build/finalize`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ draftId: draft.draftId, txHash: sealHash }) })).json()
console.log(`4. ERC-8004 #${id} minted and sealed; listed as ${JSON.stringify(fin)}`)

// 4. The agent card and the public listing.
const card = await (await fetch(`${site}/api/agents/${draft.slug}/card`)).json()
console.log(`5. card: ${card.name}, registrations ${JSON.stringify(card.registrations)}, specHash ${card.called.specHash.slice(0, 12)}…`)
const listed = (await (await fetch(`${site}/api/agents`)).json()).agents.find((a: { slug: string }) => a.slug === draft.slug)
console.log(`6. listed: ${listed.name} by ${listed.creator.slice(0, 8)}…, ready to sell: ${listed.recordReady}`)

// 5. One pass of the creator runner: it must accept the sealed spec and evaluate it.
await runCreatorAgents()
console.log('7. creator runner pass finished (see any "sealed" line above)')
process.exit(0)
