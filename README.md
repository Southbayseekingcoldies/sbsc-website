# SBSC V5.6 — Public Submissions

This build preserves the V5.5 visual design and approved hero image, while making **Submit a Coldie** functional.

## Submission flow
1. Visitor opens Submit a Coldie.
2. Visitor enters bar, address, city, beer, whole-number °F reading, measurement time, required thermometer photo, and optional Instagram/notes.
3. Photo uploads to the private Supabase Storage bucket `submission-photos`.
4. A row is inserted into `public.submissions` with `status = pending`.
5. Pending submissions do not appear on the public map.

## Supabase assumptions
- Existing `bars` and `readings` tables remain unchanged.
- `public.submissions` exists with the schema/RLS created for V5.6.
- Private Storage bucket `submission-photos` exists.
- Anonymous/authenticated users have INSERT-only policies for the pending submission row and photo upload.

## Deployment
Upload the files in this folder to the root of the existing GitHub repository. Vercel should redeploy automatically.
