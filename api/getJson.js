const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.https://unkpdsecvopwhxjodmag.supabase.co;
const supabaseKey = process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVua3Bkc2Vjdm9wd2h4am9kbWFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxMzQ0NjksImV4cCI6MjA1MzcxMDQ2OX0.4MwAFohH9DHqYu1liHeXRJTLc6ZU_AMfmVXwnnCjYdg;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async (req, res) => {
    const fileName = 'pointcloud-RyFMPN17Hx3EPvKqy2uDgmCt6CMBSg.json'; // Update this with the correct file name

    try {
        const { data, error } = await supabase.storage.from('your-bucket-name').download(fileName);

        if (error) {
            throw error;
        }

        const json = await data.text();
        res.status(200).json(JSON.parse(json));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
