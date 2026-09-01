/**
 * Fixture vocabulary.
 *
 * Hand-written rather than pulled from a faker library: the reviewer is
 * looking at an archive belonging to a Bangladeshi relief NGO, and a table
 * full of generic Western names would make every screenshot read as filler.
 * It is also an order of magnitude faster to generate, which is what lets the
 * 100,000-document mode exist at all.
 */

export const GIVEN_NAMES = [
  'Ayesha',
  'Rafiqul',
  'Nusrat',
  'Shahidul',
  'Farhana',
  'Mizanur',
  'Sumaiya',
  'Abdul',
  'Tahmina',
  'Jashim',
  'Rokeya',
  'Habibur',
  'Shirin',
  'Anwar',
  'Nasrin',
  'Kamrul',
  'Sabina',
  'Delwar',
  'Momtaz',
  'Ruhul',
  'Parvin',
  'Golam',
  'Rehana',
  'Mostafa',
  'Jharna',
  'Sohel',
  'Bilkis',
  'Alamgir',
  'Shefali',
  'Nazrul',
  'Marium',
  'Ashraful',
  'Rahima',
  'Badrul',
  'Salma',
] as const;

export const FAMILY_NAMES = [
  'Islam',
  'Rahman',
  'Hossain',
  'Akter',
  'Begum',
  'Chowdhury',
  'Uddin',
  'Khatun',
  'Ahmed',
  'Ali',
  'Miah',
  'Sarker',
  'Das',
  'Bhuiyan',
  'Talukder',
  'Mondal',
  'Sheikh',
  'Molla',
  'Howlader',
  'Biswas',
] as const;

/** Real districts — the archive is meant to look like it came from the field. */
export const DISTRICTS = [
  'Barguna',
  'Bhola',
  'Bagerhat',
  'Cox’s Bazar',
  'Chattogram',
  'Cumilla',
  'Dhaka',
  'Dinajpur',
  'Faridpur',
  'Gaibandha',
  'Jamalpur',
  'Jashore',
  'Khulna',
  'Kurigram',
  'Lalmonirhat',
  'Manikganj',
  'Mymensingh',
  'Netrokona',
  'Noakhali',
  'Patuakhali',
  'Pirojpur',
  'Rangpur',
  'Rajshahi',
  'Satkhira',
  'Shariatpur',
  'Sirajganj',
  'Sunamganj',
  'Sylhet',
  'Tangail',
  'Thakurgaon',
] as const;

export const UNIONS = [
  'Char Fasson',
  'Gabtali',
  'Kaliganj',
  'Shibganj',
  'Ulipur',
  'Sarail',
  'Debhata',
  'Mirzapur',
  'Bakerganj',
  'Nalitabari',
  'Damurhuda',
  'Companiganj',
] as const;

export const PROGRAMMES = [
  'Maternal Health Outreach',
  'Primary Education Support',
  'Flood Relief 2024',
  'Cyclone Remal Response',
  'Adolescent Nutrition',
  'Safe Water & Sanitation',
  'Winter Clothing Distribution',
  'Livelihood Restoration',
  'Child Immunisation Drive',
  'Emergency Cash Transfer',
] as const;

export const FILE_PREFIXES = [
  'scan',
  'IMG',
  'intake',
  'enrol',
  'form',
  'doc',
  'field',
  'batch',
] as const;

export const MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
] as const;

export const EXTENSION_BY_MIME: Record<(typeof MIME_TYPES)[number], string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tif',
};
