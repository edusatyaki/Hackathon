import { supabase } from './config.js';
async function test() {
    let {data} = await supabase.from('hackathons').select('*, rounds(count)');
    console.log(JSON.stringify(data, null, 2));
}
test();
