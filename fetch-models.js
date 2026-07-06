const axios = require('axios');

async function getFreeModels() {
  try {
    const res = await axios.get('https://openrouter.ai/api/v1/models');
    const freeModels = res.data.data.filter(model => model.pricing.prompt === "0" || model.pricing.prompt === 0);
    console.log(freeModels.slice(0, 10).map(m => m.id));
  } catch (err) {
    console.error(err);
  }
}
getFreeModels();
