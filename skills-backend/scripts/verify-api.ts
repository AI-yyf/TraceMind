/**
 * API Verification Script
 * Tests that the backend APIs work correctly
 */

async function main() {
  console.log('=== API Verification ===\n')

  const baseUrl = 'http://localhost:3303'

  // Test 1: Health check
  console.log('1. Testing health endpoint...')
  try {
    const healthRes = await fetch(`${baseUrl}/api/health`)
    if (healthRes.ok) {
      console.log('   ✅ Health endpoint OK')
    } else {
      console.log(`   ❌ Health endpoint failed: ${healthRes.status}`)
    }
  } catch (e) {
    console.log(`   ⚠️ Health endpoint error: ${e}`)
  }

  // Test 2: Get topics
  console.log('\n2. Testing topics list...')
  try {
    const topicsRes = await fetch(`${baseUrl}/api/topics`)
    if (topicsRes.ok) {
      const topics = await topicsRes.json()
      console.log(`   ✅ Topics endpoint OK - ${topics.length || 0} topics`)
    } else {
      console.log(`   ❌ Topics endpoint failed: ${topicsRes.status}`)
    }
  } catch (e) {
    console.log(`   ⚠️ Topics endpoint error: ${e}`)
  }

  // Test 3: Get specific topic dashboard
  console.log('\n3. Testing topic dashboard (agent)...')
  try {
    const dashboardRes = await fetch(`${baseUrl}/api/topics/agent/dashboard`)
    if (dashboardRes.ok) {
      const dashboard = await dashboardRes.json()
      console.log(`   ✅ Dashboard endpoint OK`)
      console.log(`      - Nodes: ${dashboard.nodes?.length || 0}`)
      console.log(`      - Papers: ${dashboard.papers?.length || 0}`)
    } else {
      console.log(`   ❌ Dashboard endpoint failed: ${dashboardRes.status}`)
    }
  } catch (e) {
    console.log(`   ⚠️ Dashboard endpoint error: ${e}`)
  }

  // Test 4: Get topic view model
  console.log('\n4. Testing topic view model (agent)...')
  try {
    const vmRes = await fetch(`${baseUrl}/api/topics/agent/view-model`)
    if (vmRes.ok) {
      const vm = await vmRes.json()
      console.log(`   ✅ View model endpoint OK`)
      console.log(`      - Stages: ${vm.stages?.length || 0}`)
    } else {
      console.log(`   ❌ View model endpoint failed: ${vmRes.status}`)
    }
  } catch (e) {
    console.log(`   ⚠️ View model endpoint error: ${e}`)
  }

  // Test 5: Get model configs
  console.log('\n5. Testing model configs...')
  try {
    const modelsRes = await fetch(`${baseUrl}/api/model-configs`)
    if (modelsRes.ok) {
      const models = await modelsRes.json()
      console.log(`   ✅ Model configs endpoint OK - ${models.length || 0} configs`)
    } else {
      console.log(`   ❌ Model configs endpoint failed: ${modelsRes.status}`)
    }
  } catch (e) {
    console.log(`   ⚠️ Model configs endpoint error: ${e}`)
  }

  console.log('\n=== Verification Complete ===')
}

main().catch(console.error)
