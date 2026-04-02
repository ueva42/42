--
-- PostgreSQL database dump
--

\restrict KKhsgrWkbb7xmUIlTjAP6y2EMJvUgLV0BBmjgyEBSNU02S9DiH0N3TtlacKh8UT

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bonuscards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bonuscards (
    id integer NOT NULL,
    name text NOT NULL,
    xp integer NOT NULL,
    image_url text,
    created_at timestamp without time zone DEFAULT now(),
    school_id integer
);


ALTER TABLE public.bonuscards OWNER TO postgres;

--
-- Name: bonuscards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bonuscards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bonuscards_id_seq OWNER TO postgres;

--
-- Name: bonuscards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bonuscards_id_seq OWNED BY public.bonuscards.id;


--
-- Name: characters; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.characters (
    id integer NOT NULL,
    name text NOT NULL,
    image_url text,
    created_at timestamp without time zone DEFAULT now(),
    school_id integer
);


ALTER TABLE public.characters OWNER TO postgres;

--
-- Name: characters_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.characters_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.characters_id_seq OWNER TO postgres;

--
-- Name: characters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.characters_id_seq OWNED BY public.characters.id;


--
-- Name: class_challenges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_challenges (
    id integer NOT NULL,
    class_id integer NOT NULL,
    reward_id integer NOT NULL,
    target_xp integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    school_id integer
);


ALTER TABLE public.class_challenges OWNER TO postgres;

--
-- Name: class_challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_challenges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_challenges_id_seq OWNER TO postgres;

--
-- Name: class_challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_challenges_id_seq OWNED BY public.class_challenges.id;


--
-- Name: class_reward_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_reward_options (
    id integer NOT NULL,
    round_id integer NOT NULL,
    name text NOT NULL,
    image_url text,
    reward_id integer
);


ALTER TABLE public.class_reward_options OWNER TO postgres;

--
-- Name: class_reward_options_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_reward_options_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_reward_options_id_seq OWNER TO postgres;

--
-- Name: class_reward_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_reward_options_id_seq OWNED BY public.class_reward_options.id;


--
-- Name: class_reward_rounds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_reward_rounds (
    id integer NOT NULL,
    class_id integer NOT NULL,
    school_id integer,
    status text DEFAULT 'voting'::text NOT NULL,
    selected_reward_id integer,
    xp_required integer,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    title text,
    target_xp integer DEFAULT 0 NOT NULL,
    fixed_option_id integer
);


ALTER TABLE public.class_reward_rounds OWNER TO postgres;

--
-- Name: class_reward_rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_reward_rounds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_reward_rounds_id_seq OWNER TO postgres;

--
-- Name: class_reward_rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_reward_rounds_id_seq OWNED BY public.class_reward_rounds.id;


--
-- Name: class_reward_votes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_reward_votes (
    id integer NOT NULL,
    round_id integer NOT NULL,
    student_id integer NOT NULL,
    reward_id integer,
    created_at timestamp without time zone DEFAULT now(),
    option_id integer NOT NULL
);


ALTER TABLE public.class_reward_votes OWNER TO postgres;

--
-- Name: class_reward_votes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_reward_votes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_reward_votes_id_seq OWNER TO postgres;

--
-- Name: class_reward_votes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_reward_votes_id_seq OWNED BY public.class_reward_votes.id;


--
-- Name: class_rewards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_rewards (
    id integer NOT NULL,
    name text NOT NULL,
    xp_required integer NOT NULL,
    image_url text,
    school_id integer,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.class_rewards OWNER TO postgres;

--
-- Name: class_rewards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.class_rewards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.class_rewards_id_seq OWNER TO postgres;

--
-- Name: class_rewards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.class_rewards_id_seq OWNED BY public.class_rewards.id;


--
-- Name: classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classes (
    id integer NOT NULL,
    name text NOT NULL,
    school_id integer
);


ALTER TABLE public.classes OWNER TO postgres;

--
-- Name: classes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.classes_id_seq OWNER TO postgres;

--
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.classes_id_seq OWNED BY public.classes.id;


--
-- Name: levels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.levels (
    id integer NOT NULL,
    name text NOT NULL,
    min_xp integer NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    school_id integer
);


ALTER TABLE public.levels OWNER TO postgres;

--
-- Name: levels_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.levels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.levels_id_seq OWNER TO postgres;

--
-- Name: levels_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.levels_id_seq OWNED BY public.levels.id;


--
-- Name: missions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.missions (
    id integer NOT NULL,
    name text NOT NULL,
    xp integer NOT NULL,
    image_url text,
    require_upload boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    school_id integer
);


ALTER TABLE public.missions OWNER TO postgres;

--
-- Name: missions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.missions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.missions_id_seq OWNER TO postgres;

--
-- Name: missions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.missions_id_seq OWNED BY public.missions.id;


--
-- Name: schools; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schools (
    id integer NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.schools OWNER TO postgres;

--
-- Name: schools_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.schools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.schools_id_seq OWNER TO postgres;

--
-- Name: schools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.schools_id_seq OWNED BY public.schools.id;


--
-- Name: student_mission_uploads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_mission_uploads (
    id integer NOT NULL,
    student_id integer NOT NULL,
    mission_id integer NOT NULL,
    image_url text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.student_mission_uploads OWNER TO postgres;

--
-- Name: student_mission_uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_mission_uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_mission_uploads_id_seq OWNER TO postgres;

--
-- Name: student_mission_uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_mission_uploads_id_seq OWNED BY public.student_mission_uploads.id;


--
-- Name: student_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_state (
    id integer NOT NULL,
    user_id integer NOT NULL,
    character_id integer,
    traits jsonb,
    items jsonb,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.student_state OWNER TO postgres;

--
-- Name: student_state_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_state_id_seq OWNER TO postgres;

--
-- Name: student_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_state_id_seq OWNED BY public.student_state.id;


--
-- Name: student_uploads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_uploads (
    id integer NOT NULL,
    student_id integer NOT NULL,
    image_url text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    mission_id integer,
    school_id integer
);


ALTER TABLE public.student_uploads OWNER TO postgres;

--
-- Name: student_uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.student_uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.student_uploads_id_seq OWNER TO postgres;

--
-- Name: student_uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.student_uploads_id_seq OWNED BY public.student_uploads.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text NOT NULL,
    password text NOT NULL,
    role text DEFAULT 'student'::text NOT NULL,
    class_id integer,
    xp integer DEFAULT 0,
    highest_xp integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    character_id integer,
    level_id integer,
    traits jsonb,
    items jsonb,
    first_login boolean DEFAULT false NOT NULL,
    school_id integer
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: xp_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.xp_transactions (
    id integer NOT NULL,
    student_id integer NOT NULL,
    mission_id integer,
    awarded_by integer,
    created_at timestamp without time zone DEFAULT now(),
    amount integer DEFAULT 0 NOT NULL,
    source text,
    school_id integer
);


ALTER TABLE public.xp_transactions OWNER TO postgres;

--
-- Name: xp_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.xp_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.xp_transactions_id_seq OWNER TO postgres;

--
-- Name: xp_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.xp_transactions_id_seq OWNED BY public.xp_transactions.id;


--
-- Name: bonuscards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bonuscards ALTER COLUMN id SET DEFAULT nextval('public.bonuscards_id_seq'::regclass);


--
-- Name: characters id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters ALTER COLUMN id SET DEFAULT nextval('public.characters_id_seq'::regclass);


--
-- Name: class_challenges id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_challenges ALTER COLUMN id SET DEFAULT nextval('public.class_challenges_id_seq'::regclass);


--
-- Name: class_reward_options id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_options ALTER COLUMN id SET DEFAULT nextval('public.class_reward_options_id_seq'::regclass);


--
-- Name: class_reward_rounds id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_rounds ALTER COLUMN id SET DEFAULT nextval('public.class_reward_rounds_id_seq'::regclass);


--
-- Name: class_reward_votes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes ALTER COLUMN id SET DEFAULT nextval('public.class_reward_votes_id_seq'::regclass);


--
-- Name: class_rewards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_rewards ALTER COLUMN id SET DEFAULT nextval('public.class_rewards_id_seq'::regclass);


--
-- Name: classes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes ALTER COLUMN id SET DEFAULT nextval('public.classes_id_seq'::regclass);


--
-- Name: levels id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels ALTER COLUMN id SET DEFAULT nextval('public.levels_id_seq'::regclass);


--
-- Name: missions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.missions ALTER COLUMN id SET DEFAULT nextval('public.missions_id_seq'::regclass);


--
-- Name: schools id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools ALTER COLUMN id SET DEFAULT nextval('public.schools_id_seq'::regclass);


--
-- Name: student_mission_uploads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_mission_uploads ALTER COLUMN id SET DEFAULT nextval('public.student_mission_uploads_id_seq'::regclass);


--
-- Name: student_state id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_state ALTER COLUMN id SET DEFAULT nextval('public.student_state_id_seq'::regclass);


--
-- Name: student_uploads id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_uploads ALTER COLUMN id SET DEFAULT nextval('public.student_uploads_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: xp_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.xp_transactions ALTER COLUMN id SET DEFAULT nextval('public.xp_transactions_id_seq'::regclass);


--
-- Data for Name: bonuscards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bonuscards (id, name, xp, image_url, created_at, school_id) FROM stdin;
13	5-Minuten Chill-Break	30	\N	2025-11-25 07:33:59.453144	4
14	Hausaufgaben-Joker (1x)	60	\N	2025-11-25 07:33:59.453144	4
15	Boss-Seat: Wunschplatz	90	\N	2025-11-25 07:33:59.453144	4
16	5-Minuten Chill-Break	30	\N	2025-11-25 10:53:30.999885	3
17	Hausaufgaben-Joker (1x)	60	\N	2025-11-25 10:53:30.999885	3
18	Boss-Seat: Wunschplatz	90	\N	2025-11-25 10:53:30.999885	3
19	5-Minuten Chill-Break	30	\N	2025-11-27 10:20:48.643041	5
20	Hausaufgaben-Joker (1x)	60	\N	2025-11-27 10:20:48.643041	5
21	Boss-Seat: Wunschplatz	90	\N	2025-11-27 10:20:48.643041	5
22	5-Minuten Chill-Break	30	\N	2025-11-28 22:42:14.594767	6
23	Hausaufgaben-Joker (1x)	60	\N	2025-11-28 22:42:14.594767	6
24	Boss-Seat: Wunschplatz	90	\N	2025-11-28 22:42:14.594767	6
26	Neon Notes Drop	100	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/bonuscards/1_1764449071670_8.png	2025-11-29 20:44:35.220122	1
27	Logic Assist	150	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/bonuscards/1_1764449093939_9.png	2025-11-29 20:44:57.582113	1
28	Logic Token	150	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/bonuscards/1_1764449116484_10.png	2025-11-29 20:45:22.512878	1
29	Bonus Hit	150	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/bonuscards/1_1764449145577_11.png	2025-11-29 20:45:49.972307	1
30	Street Legend Pass	250	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/bonuscards/1_1764449166974_12.png	2025-11-29 20:46:09.265063	1
31	5-Minuten Chill-Break	30	\N	2026-03-31 11:40:21.668387	7
32	Hausaufgaben-Joker (1x)	60	\N	2026-03-31 11:40:21.668387	7
33	Boss-Seat: Wunschplatz	90	\N	2026-03-31 11:40:21.668387	7
\.


--
-- Data for Name: characters; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.characters (id, name, image_url, created_at, school_id) FROM stdin;
48	Vega	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974999015_13.png	2025-11-24 09:03:22.498455	1
50	Kade	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975025044_14.png	2025-11-24 09:04:06.17586	1
51	Raven	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975058274_15.png	2025-11-24 09:04:21.043685	1
52	Evan	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975073409_16.png	2025-11-24 09:04:36.622103	1
54	Lucy	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975137751_17.png	2025-11-24 09:05:56.874484	1
55	Carlos	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975168591_18.png	2025-11-24 09:06:19.529651	1
56	Raya	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975197293_19.png	2025-11-24 09:06:42.325037	1
57	Mira	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975215498_20.png	2025-11-24 09:06:59.157889	1
59	Bruno	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975230730_21.png	2025-11-24 09:07:29.617198	1
22	Ely	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763934440928_1.png	2025-11-23 21:47:38.869848	1
23	Tara	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763934656326_2.png	2025-11-23 21:50:59.800499	1
25	Jax	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763936307868_3.png	2025-11-23 22:18:30.177291	1
27	Mila	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763936368951_4.png	2025-11-23 22:19:30.888345	1
34	Drex	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974519174_5.png	2025-11-24 08:55:56.203471	1
36	Yuna	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974571092_6.png	2025-11-24 08:56:36.461901	1
40	Mason	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974694803_7.png	2025-11-24 08:58:16.890961	1
42	Rika	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974735129_8.png	2025-11-24 08:58:57.415224	1
44	Aragon	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974774297_9.png	2025-11-24 08:59:36.226836	1
45	Flux	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974789564_10.png	2025-11-24 08:59:52.857335	1
46	Nori	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974805229_11.png	2025-11-24 09:00:08.856524	1
47	John	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763974981981_12.png	2025-11-24 09:03:05.36565	1
61	Dalia	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975312316_22.png	2025-11-24 09:08:40.216709	1
63	Mathew	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975348732_23.png	2025-11-24 09:09:13.109522	1
64	Mat	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975371065_24.png	2025-11-24 09:09:34.312982	1
66	Max	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975391090_25.png	2025-11-24 09:10:10.299723	1
67	Ivy	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975454371_26.png	2025-11-24 09:10:58.98992	1
68	Rebecca	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975473335_27.png	2025-11-24 09:11:17.242657	1
69	Olix	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975526408_30.png	2025-11-24 09:12:11.389845	1
70	Jimmy	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975606171_31.png	2025-11-24 09:13:30.407659	1
71	Murdock	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975623954_32.png	2025-11-24 09:13:50.300685	1
72	Willow	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975645132_33.png	2025-11-24 09:14:09.55917	1
73	Eleanor	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975667645_34.png	2025-11-24 09:14:57.814487	1
74	Razer	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975713649_35.png	2025-11-24 09:15:18.069272	1
75	Dicefather	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/characters/1_1763975730907_36.png	2025-11-24 09:15:36.859412	1
76	Nova Drift	\N	2025-11-25 07:33:59.456393	4
77	Pixel Rydah	\N	2025-11-25 07:33:59.456393	4
78	Logic Lynx	\N	2025-11-25 07:33:59.456393	4
79	Neon Vibes	\N	2025-11-25 07:33:59.456393	4
80	Nova Drift	\N	2025-11-25 10:53:31.002621	3
81	Pixel Rydah	\N	2025-11-25 10:53:31.002621	3
82	Logic Lynx	\N	2025-11-25 10:53:31.002621	3
83	Neon Vibes	\N	2025-11-25 10:53:31.002621	3
85	Nova Drift	\N	2025-11-27 10:20:48.6469	5
86	Pixel Rydah	\N	2025-11-27 10:20:48.6469	5
87	Logic Lynx	\N	2025-11-27 10:20:48.6469	5
88	Neon Vibes	\N	2025-11-27 10:20:48.6469	5
89	Nova Drift	\N	2025-11-28 22:42:14.597358	6
90	Pixel Rydah	\N	2025-11-28 22:42:14.597358	6
91	Logic Lynx	\N	2025-11-28 22:42:14.597358	6
92	Neon Vibes	\N	2025-11-28 22:42:14.597358	6
94	Nova Drift	\N	2026-03-31 11:40:21.673627	7
95	Pixel Rydah	\N	2026-03-31 11:40:21.673627	7
96	Logic Lynx	\N	2026-03-31 11:40:21.673627	7
97	Neon Vibes	\N	2026-03-31 11:40:21.673627	7
\.


--
-- Data for Name: class_challenges; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_challenges (id, class_id, reward_id, target_xp, is_active, created_at, school_id) FROM stdin;
\.


--
-- Data for Name: class_reward_options; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_reward_options (id, round_id, name, image_url, reward_id) FROM stdin;
13	7	aaa	\N	\N
14	7	bbb	\N	\N
15	7	ccc	\N	\N
16	8	aaa	\N	\N
17	8	bbb	\N	\N
18	8	ccc	\N	\N
19	8	ggg	\N	\N
20	9	aaa	\N	\N
21	9	ggg	\N	\N
22	9	ccc	\N	\N
23	10	ggg	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314278113_15.png	\N
24	10	nnnn	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314317903_13.png	\N
25	11	ggg	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314278113_15.png	\N
26	11	aaa	\N	\N
27	11	ggg	\N	\N
28	12	ggg	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314278113_15.png	\N
29	12	nnnn	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314317903_13.png	\N
30	13	ggg	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314278113_15.png	\N
31	13	nnnn	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314317903_13.png	\N
32	14	dddddd	\N	\N
33	14	ffffffff	\N	\N
34	14	ggg	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764314278113_15.png	\N
35	15	Ausflug	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537597117_14.png	\N
36	15	Maker Day	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537648279_17.png	\N
37	15	Class Boost	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537822867_21.png	\N
38	15	Pizza	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537617548_16.png	\N
39	16	Kuchen	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537720935_19.png	\N
40	16	Mystery Box	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537756868_20.png	\N
41	16	DJ Set	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537792015_18.png	\N
\.


--
-- Data for Name: class_reward_rounds; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_reward_rounds (id, class_id, school_id, status, selected_reward_id, xp_required, created_at, completed_at, is_active, title, target_xp, fixed_option_id) FROM stdin;
12	14	1	voting	\N	\N	2025-11-28 08:01:29.352222	\N	f	sfgigoöegjoöi	300	28
5	14	1	voting	\N	\N	2025-11-26 21:36:00.272724	\N	f	test4	400	\N
6	14	1	voting	\N	\N	2025-11-27 10:04:45.36437	\N	f	dumm	400	\N
7	14	1	voting	\N	\N	2025-11-27 10:14:50.042039	\N	f	dumm	400	\N
8	14	1	voting	\N	\N	2025-11-27 11:08:55.440675	\N	f	dapp	400	16
9	14	1	voting	\N	\N	2025-11-27 19:03:12.738459	\N	f	doooof	500	\N
10	14	1	voting	\N	\N	2025-11-28 07:18:56.803792	\N	f	grumml	300	\N
11	14	1	voting	\N	\N	2025-11-28 07:28:04.915765	\N	f	sfdgdfhdgfh	400	26
13	14	1	voting	\N	\N	2025-11-28 10:06:22.085583	\N	f	hhhhhh	300	30
14	14	1	voting	\N	\N	2025-11-28 11:48:36.793438	\N	f	rltiolkruz	1000	32
15	16	1	voting	\N	\N	2025-11-30 21:24:13.710381	\N	t	10c Challenge	10000	\N
16	15	1	voting	\N	\N	2025-11-30 21:25:38.024473	\N	t	9b Challenge	8000	\N
\.


--
-- Data for Name: class_reward_votes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_reward_votes (id, round_id, student_id, reward_id, created_at, option_id) FROM stdin;
17	9	208	\N	2025-11-28 07:17:24.218505	20
21	10	208	\N	2025-11-28 07:20:15.142837	23
22	11	208	\N	2025-11-28 07:28:37.211527	26
23	12	208	\N	2025-11-28 08:01:53.085624	28
24	13	208	\N	2025-11-28 10:06:48.141869	30
25	14	208	\N	2025-11-28 11:49:27.603397	32
26	15	531	\N	2026-01-07 09:50:06.430107	38
27	15	536	\N	2026-01-07 09:55:34.560798	38
28	15	526	\N	2026-01-07 09:55:43.104666	35
29	15	527	\N	2026-01-07 09:56:25.443422	36
30	15	542	\N	2026-01-07 09:57:31.412119	38
31	15	549	\N	2026-01-07 09:57:36.155179	38
32	15	537	\N	2026-01-07 09:57:48.508353	35
33	15	543	\N	2026-01-07 09:57:49.54964	35
34	15	545	\N	2026-01-07 09:58:04.003621	35
35	15	544	\N	2026-01-07 09:58:29.706826	35
36	15	529	\N	2026-01-07 09:58:50.3457	35
37	15	534	\N	2026-01-07 09:58:51.576647	35
38	15	532	\N	2026-01-07 09:59:02.018129	35
39	15	562	\N	2026-01-07 09:59:12.641708	35
40	15	548	\N	2026-01-07 10:00:04.060695	37
41	16	523	\N	2026-01-09 10:51:12.644811	40
42	16	516	\N	2026-01-09 10:52:13.366242	39
43	16	510	\N	2026-01-09 10:52:15.967332	39
44	16	509	\N	2026-01-09 10:53:05.531505	40
45	16	513	\N	2026-01-09 10:53:24.713048	39
46	16	511	\N	2026-01-09 10:53:35.146449	39
47	16	519	\N	2026-01-09 10:55:21.607473	39
48	16	521	\N	2026-01-09 10:56:20.117177	39
49	16	514	\N	2026-01-09 10:59:37.810216	39
50	15	546	\N	2026-01-09 11:22:22.978545	35
51	16	508	\N	2026-01-11 17:02:46.977145	39
52	16	498	\N	2026-01-12 07:33:55.159804	39
53	15	533	\N	2026-01-12 10:52:47.659968	37
54	15	563	\N	2026-01-12 10:52:58.777591	35
55	16	497	\N	2026-01-20 07:26:46.994885	40
56	16	522	\N	2026-01-20 07:27:19.683833	40
\.


--
-- Data for Name: class_rewards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.class_rewards (id, name, xp_required, image_url, school_id, created_at) FROM stdin;
17	BBQ	10000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537571171_15.png	1	2025-11-30 21:19:35.873866
18	Ausflug	10000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537597117_14.png	1	2025-11-30 21:20:00.716019
19	Pizza	10000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537617548_16.png	1	2025-11-30 21:20:25.459641
20	Maker Day	10000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537648279_17.png	1	2025-11-30 21:20:53.571884
22	Kuchen	8000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537720935_19.png	1	2025-11-30 21:22:04.767499
23	Mystery Box	8000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537756868_20.png	1	2025-11-30 21:22:49.907053
24	DJ Set	8000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537792015_18.png	1	2025-11-30 21:23:18.608192
25	Class Boost	10000	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/class_rewards/1_1764537822867_21.png	1	2025-11-30 21:23:47.695324
\.


--
-- Data for Name: classes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.classes (id, name, school_id) FROM stdin;
14	bla	1
15	9b	1
16	10c	1
\.


--
-- Data for Name: levels; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.levels (id, name, min_xp, created_at, school_id) FROM stdin;
14	Rookie	0	2025-11-25 07:33:59.446692	4
15	Street Pro	100	2025-11-25 07:33:59.446692	4
16	Logic Legend	250	2025-11-25 07:33:59.446692	4
18	Street Pro	100	2025-11-25 10:53:30.993982	3
19	Logic Legend	250	2025-11-25 10:53:30.993982	3
20	Rookie	0	2025-11-27 10:20:48.633443	5
21	Street Pro	100	2025-11-27 10:20:48.633443	5
22	Logic Legend	250	2025-11-27 10:20:48.633443	5
24	Rookie	0	2025-11-28 22:42:14.586603	6
25	Street Pro	100	2025-11-28 22:42:14.586603	6
26	Logic Legend	250	2025-11-28 22:42:14.586603	6
4	Fixer	200	2025-11-19 09:46:38.184927	1
5	Operator	300	2025-11-19 09:46:47.914254	1
6	Street Legend	500	2025-11-19 09:47:00.602728	1
38	Scout	100	2025-11-29 12:28:25.22942	1
1	Rookie	0	2025-11-19 08:57:10.101688	1
17	fortnite	0	2025-11-25 10:53:30.993982	3
42	Logic Legend	1000	2025-11-29 12:30:34.079686	1
43	Rookie	0	2026-03-31 11:40:21.648381	7
44	Street Pro	100	2026-03-31 11:40:21.648381	7
45	Logic Legend	250	2026-03-31 11:40:21.648381	7
\.


--
-- Data for Name: missions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.missions (id, name, xp, image_url, require_upload, created_at, school_id) FROM stdin;
14	Warm-Up: Konzentrations-Drive	10	\N	f	2025-11-25 07:33:59.450137	4
15	Math Hustle: Gleichungsjagd	20	\N	t	2025-11-25 07:33:59.450137	4
16	Logic Run: Rätsel-Checkpoint	30	\N	t	2025-11-25 07:33:59.450137	4
17	Warm-Up: Konzentrations-Drive	10	\N	f	2025-11-25 10:53:30.997187	3
18	Math Hustle: Gleichungsjagd	20	\N	t	2025-11-25 10:53:30.997187	3
19	Logic Run: Rätsel-Checkpoint	30	\N	t	2025-11-25 10:53:30.997187	3
20	Warm-Up: Konzentrations-Drive	10	\N	f	2025-11-27 10:20:48.637922	5
21	Math Hustle: Gleichungsjagd	20	\N	t	2025-11-27 10:20:48.637922	5
22	Logic Run: Rätsel-Checkpoint	30	\N	t	2025-11-27 10:20:48.637922	5
24	Warm-Up: Konzentrations-Drive	10	\N	f	2025-11-28 22:42:14.589987	6
25	Math Hustle: Gleichungsjagd	20	\N	t	2025-11-28 22:42:14.589987	6
26	Logic Run: Rätsel-Checkpoint	30	\N	t	2025-11-28 22:42:14.589987	6
29	Mission Plan	5	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433441747_1.png	t	2025-11-29 16:24:34.009679	1
31	Focus Mode	5	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433495442_2.png	f	2025-11-29 16:25:23.397198	1
32	Early Boost	5	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433560635_3.png	f	2025-11-29 16:26:04.598027	1
33	Bonus Hunter	5	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433582022_4.png	t	2025-11-29 16:26:28.436085	1
34	After Class Crew	20	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433607431_5.png	f	2025-11-29 16:26:51.403106	1
35	Multiplayer	5	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433633975_6.png	f	2025-11-29 16:27:20.599895	1
36	Logic Guide	25	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/missions/1_1764433664222_7.png	f	2025-11-29 16:27:51.436441	1
37	Warm-Up: Konzentrations-Drive	10	\N	f	2026-03-31 11:40:21.656817	7
38	Math Hustle: Gleichungsjagd	20	\N	t	2026-03-31 11:40:21.656817	7
39	Logic Run: Rätsel-Checkpoint	30	\N	t	2026-03-31 11:40:21.656817	7
\.


--
-- Data for Name: schools; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.schools (id, name, slug, created_at) FROM stdin;
1	ADSZ	adsz	2025-11-23 21:21:03.943139
3	test	test	2025-11-23 22:03:22.91548
4	volker	v	2025-11-25 07:33:59.440019
6	christoph	c	2025-11-28 22:42:14.58152
7	teacheracademy	e	2026-03-31 11:40:21.628541
\.


--
-- Data for Name: student_mission_uploads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.student_mission_uploads (id, student_id, mission_id, image_url, created_at) FROM stdin;
\.


--
-- Data for Name: student_state; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.student_state (id, user_id, character_id, traits, items, created_at) FROM stdin;
\.


--
-- Data for Name: student_uploads; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.student_uploads (id, student_id, image_url, created_at, mission_id, school_id) FROM stdin;
78	497	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_497_29_1771830613704_IMG_0209.jpeg	2026-02-23 07:10:16.215505	29	1
79	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1771836836523_IMG_1165.jpeg	2026-02-23 08:53:58.725914	29	1
80	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1771836874575_IMG_1166.jpeg	2026-02-23 08:54:35.772557	29	1
81	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1771836876431_IMG_1166.jpeg	2026-02-23 08:54:37.505593	29	1
82	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1771836881529_IMG_1166.jpeg	2026-02-23 08:54:42.588339	29	1
83	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1771836883114_IMG_1166.jpeg	2026-02-23 08:54:44.594493	29	1
84	514	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_514_29_1772190581386_lernplan 5.pdf	2026-02-27 11:09:44.514626	29	1
85	514	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_514_29_1772190584460_lernplan 5.pdf	2026-02-27 11:09:47.165531	29	1
86	514	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_514_29_1772190587319_lernplan 5.pdf	2026-02-27 11:09:49.240502	29	1
87	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1772294889557_IMG_1193.jpeg	2026-02-28 16:08:12.099182	29	1
88	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1772294902781_IMG_1193.jpeg	2026-02-28 16:08:24.698047	29	1
89	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1772437147418_IMG_1202.jpeg	2026-03-02 07:39:09.579412	29	1
90	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1772437158514_IMG_1202.jpeg	2026-03-02 07:39:19.55492	29	1
91	498	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_498_33_1772607222617_Arbeitsplan 2.pdf	2026-03-04 06:53:45.230812	33	1
92	498	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_498_33_1772607225363_Arbeitsplan 2.pdf	2026-03-04 06:53:46.672388	33	1
93	498	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_498_33_1772607234378_Arbeitsplan 3.pdf	2026-03-04 06:53:56.414673	33	1
94	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773131470860_IMG_1257.jpeg	2026-03-10 08:31:13.565832	29	1
95	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773400299344_IMG_1335.jpeg	2026-03-13 11:11:40.581348	29	1
96	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773400297804_IMG_1335.jpeg	2026-03-13 11:11:40.804721	29	1
97	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773400300609_IMG_1335.jpeg	2026-03-13 11:11:42.355527	29	1
98	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773400300781_IMG_1335.jpeg	2026-03-13 11:11:43.371318	29	1
99	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773647112521_IMG_1365.jpeg	2026-03-16 07:45:14.682828	29	1
100	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773746555928_IMG_1375.png	2026-03-17 11:22:38.386508	29	1
101	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1773746558782_IMG_1375.png	2026-03-17 11:22:41.085955	29	1
102	497	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_497_29_1774249772131_IMG_0305.png	2026-03-23 07:09:35.611097	29	1
103	497	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_497_29_1774249776555_IMG_0305.png	2026-03-23 07:09:38.063854	29	1
104	510	https://pub-434b7989a4ce458cb70f59c5b8fd546f.r2.dev/uploads/1_510_29_1774335784582_IMG_1418.jpeg	2026-03-24 07:03:07.377057	29	1
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, password, role, class_id, xp, highest_xp, created_at, character_id, level_id, traits, items, first_login, school_id) FROM stdin;
473	Admin_c	bcDe9S	admin	\N	0	0	2025-11-28 22:42:26.598635	\N	\N	\N	\N	f	6
208	emil	blabla	student	14	715	0	2025-11-24 15:30:49.712286	74	6	["Risikofreudig", "Sorgfältig", "Zielstrebig"]	["Lineal", "Rucksack", "Kompass"]	f	1
454	matse	blabla	student	14	215	0	2025-11-28 12:42:18.338885	40	4	["Kreativ", "Ruhig", "Teamorientiert"]	["Logikstein", "Zirkel der Präzision", "Zauberstift"]	f	1
492	admin_t	bruhrain	admin	\N	0	0	2025-11-29 12:29:20.636202	\N	\N	\N	\N	f	3
501	MoritzG	moritz	student	15	135	0	2025-11-29 20:50:30.213508	75	38	["Kreativ", "Optimistisch", "Strukturiert"]	["Rucksack", "Lampe", "Zirkel der Präzision"]	f	1
528	GianinaC	trudicool	student	16	120	0	2025-11-29 21:38:34.85854	42	38	["Sorgfältig", "Ausdauernd", "Neugierig"]	["Zauberstift", "Rechenamulett", "Zirkel der Präzision"]	f	1
518	NilaT	Nino15	student	15	155	0	2025-11-29 20:53:14.503015	\N	38	["Teamorientiert", "Hilfsbereit", "Mutig"]	["Zirkel der Präzision", "Kompass", "Rucksack"]	f	1
515	AleksaP	Delije1989	student	15	135	0	2025-11-29 20:52:49.583386	51	38	["Neugierig", "Zielstrebig", "Hilfsbereit"]	["Zirkel der Präzision", "Rechenamulett", "Rucksack"]	f	1
562	HannahG	O.441955m	student	16	210	0	2025-12-12 11:45:10.409749	73	4	["Zielstrebig", "Hilfsbereit", "Neugierig"]	["Rechenamulett", "Lineal", "Logikstein"]	f	1
504	NoraK	TennisU10	student	15	155	0	2025-11-29 20:50:55.28657	46	38	["Hilfsbereit", "Aufmerksam", "Analytisch"]	["Zirkel der Präzision", "Lampe", "Rechenamulett"]	f	1
540	IsabelO	fgYELp	student	16	115	0	2025-11-29 21:40:12.205869	\N	38	\N	\N	t	1
498	AlexisD	Adrenalin10	student	15	155	0	2025-11-29 20:49:18.952366	56	38	["Strukturiert", "Hilfsbereit", "Pragmatisch"]	["Rechenamulett", "Lineal", "Zauberstift"]	f	1
561	steffeng	9XpJwz	student	15	85	0	2025-12-12 10:54:38.580374	\N	1	\N	\N	t	1
538	JohannaL	jo08hanna	student	16	120	0	2025-11-29 21:39:57.245279	54	38	["Neugierig", "Risikofreudig", "Mutig"]	["Rucksack", "Logikstein", "Zauberstift"]	f	1
535	AischaJ	Waage2009	student	16	115	0	2025-11-29 21:39:30.65271	67	38	["Analytisch", "Pragmatisch", "Optimistisch"]	["Formelbuch", "Lampe", "Logikstein"]	f	1
552	julian	blabla	student	14	0	0	2025-12-03 07:27:23.839845	25	\N	["Ausdauernd", "Sorgfältig", "Zielstrebig"]	["Rucksack", "Zirkel der Präzision", "Lampe"]	f	1
509	JonasL	Degu!2010	student	15	135	0	2025-11-29 20:51:44.737832	44	38	["Analytisch", "Ruhig", "Kreativ"]	["Zirkel der Präzision", "Formelbuch", "Lineal"]	f	1
525	AngelinaB	Heradpre	student	16	120	0	2025-11-29 21:38:07.447013	46	38	["Hilfsbereit", "Optimistisch", "Zielstrebig"]	["Rucksack", "Zirkel der Präzision", "Rechenamulett"]	f	1
543	LarsR	Lars2010	student	16	115	0	2025-11-29 21:40:34.433984	55	38	["Neugierig", "Ruhig", "Sorgfältig"]	["Lineal", "Logikstein", "Rechenamulett"]	f	1
512	JuleO	Emilia2011!	student	15	175	0	2025-11-29 20:52:12.323078	68	38	["Pragmatisch", "Hilfsbereit", "Kreativ"]	["Formelbuch", "Lampe", "Rechenamulett"]	f	1
506	LenjaK	lilou1	student	15	180	0	2025-11-29 20:51:10.122901	48	38	["Kreativ", "Analytisch", "Ausdauernd"]	["Zirkel der Präzision", "Zauberstift", "Lampe"]	f	1
505	MarieK	yghqa5	student	15	155	0	2025-11-29 20:51:02.908765	\N	38	\N	\N	t	1
529	ChrisD	Chris222010	student	16	130	0	2025-11-29 21:38:43.097078	40	38	["Analytisch", "Ruhig", "Sorgfältig"]	["Zirkel der Präzision", "Lampe", "Rechenamulett"]	f	1
549	SvenjaW	Aila2017	student	16	130	0	2025-11-29 21:41:20.866828	23	38	["Sorgfältig", "Analytisch", "Strukturiert"]	["Logikstein", "Rechenamulett", "Formelbuch"]	f	1
521	MarleenW	Äurel143	student	15	205	0	2025-11-29 20:53:32.974711	36	4	["Mutig", "Optimistisch", "Aufmerksam"]	["Lineal", "Zirkel der Präzision", "Formelbuch"]	f	1
546	VinzentS	Passwort545	student	16	140	0	2025-11-29 21:41:00.446402	59	38	["Ruhig", "Risikofreudig", "Neugierig"]	["Zirkel der Präzision", "Logikstein", "Lampe"]	f	1
150	admin	kVnVVU	admin	\N	0	0	2025-11-23 21:27:16.461462	\N	\N	\N	\N	t	2
553	admin_j	zFnXQ2	admin	\N	0	0	2025-12-03 07:30:45.304708	\N	\N	\N	\N	f	3
522	MoritzZ	Bruchsal101010	student	15	135	0	2025-11-29 20:53:40.046878	34	38	["Ruhig", "Aufmerksam", "Sorgfältig"]	["Lineal", "Lampe", "Zauberstift"]	f	1
526	DominikB	Dominik240310	student	16	125	0	2025-11-29 21:38:18.742749	34	38	["Neugierig", "Aufmerksam", "Hilfsbereit"]	["Zirkel der Präzision", "Rucksack", "Zauberstift"]	f	1
513	TimO	uz6+AC	student	15	150	0	2025-11-29 20:52:31.712821	44	38	["Risikofreudig", "Optimistisch", "Neugierig"]	["Lampe", "Logikstein", "Rucksack"]	f	1
201	Christoph	CX63tZ	student	14	215	0	2025-11-24 11:03:59.245745	50	4	["Hilfsbereit", "Aufmerksam", "Neugierig"]	["Zauberstift", "Rechenamulett", "Lineal"]	t	1
463	hugo	blabla	student	14	200	0	2025-11-28 21:54:47.450159	48	4	["Neugierig", "Ruhig", "Aufmerksam"]	["Lineal", "Kompass", "Rechenamulett"]	f	1
202	steffen	blabla	student	14	215	0	2025-11-24 11:04:04.023738	22	4	["Aufmerksam", "Sorgfältig", "Neugierig"]	["Rucksack", "Zirkel der Präzision", "Kompass"]	f	1
502	AnnaG	Schule!	student	15	180	0	2025-11-29 20:50:38.279726	67	38	["Neugierig", "Risikofreudig", "Sorgfältig"]	["Rucksack", "Lampe", "Zirkel der Präzision"]	f	1
536	RobinK	Robin1705	student	16	115	0	2025-11-29 21:39:40.475396	34	38	["Mutig", "Strukturiert", "Pragmatisch"]	["Rucksack", "Kompass", "Lampe"]	f	1
519	VincentW	Wacker1810	student	15	110	0	2025-11-29 20:53:20.872763	22	38	["Strukturiert", "Hilfsbereit", "Ausdauernd"]	["Zirkel der Präzision", "Formelbuch", "Lampe"]	f	1
233	admin_v	zz4r79	admin	\N	0	0	2025-11-25 07:34:16.132354	\N	\N	\N	\N	f	4
534	VinzentI	dUbruj-xersax-pomfy1	student	16	120	0	2025-11-29 21:39:23.871874	74	38	["Hilfsbereit", "Kreativ", "Aufmerksam"]	["Lampe", "Rechenamulett", "Logikstein"]	f	1
495	LeonB	28bG9e	student	15	135	0	2025-11-29 20:48:37.357175	\N	38	\N	\N	t	1
541	HannahR	Hoppel2026	student	16	120	0	2025-11-29 21:40:19.66317	46	38	["Aufmerksam", "Zielstrebig", "Hilfsbereit"]	["Zauberstift", "Rucksack", "Lampe"]	f	1
510	AureliaM	Murle77	student	15	275	0	2025-11-29 20:51:54.470037	73	4	["Aufmerksam", "Sorgfältig", "Ausdauernd"]	["Zirkel der Präzision", "Formelbuch", "Zauberstift"]	f	1
580	admin_s	sJB6LG	admin	\N	0	0	2026-03-31 12:25:54.945231	\N	\N	\N	\N	f	7
563	JonathanV	dHimH,Ps2301	student	16	65	0	2026-01-07 09:58:44.648217	71	1	["Sorgfältig", "Kreativ", "Ausdauernd"]	["Zirkel der Präzision", "Zauberstift", "Rucksack"]	f	1
499	LeonieD	leonie11	student	15	135	0	2025-11-29 20:49:30.754403	\N	38	["Analytisch", "Sorgfältig", "Strukturiert"]	["Rucksack", "Zauberstift", "Lineal"]	f	1
533	KevinH	voJpot-wyzjaf-1cedgi	student	16	130	0	2025-11-29 21:39:14.927195	55	38	["Ruhig", "Neugierig", "Mutig"]	["Zirkel der Präzision", "Zauberstift", "Rucksack"]	f	1
537	MarkK	markneu21	student	16	115	0	2025-11-29 21:39:47.129609	75	38	["Mutig", "Ausdauernd", "Neugierig"]	["Logikstein", "Rechenamulett", "Kompass"]	f	1
496	LouisB	uKW9AV	student	15	135	0	2025-11-29 20:48:45.755148	\N	38	\N	\N	t	1
544	OscarS	Oscar1.2.3	student	16	120	0	2025-11-29 21:40:42.858123	40	38	["Zielstrebig", "Pragmatisch", "Strukturiert"]	["Zauberstift", "Lampe", "Rucksack"]	f	1
507	MarlaK	Marla.11	student	15	135	0	2025-11-29 20:51:28.233721	68	38	["Sorgfältig", "Risikofreudig", "Neugierig"]	["Zirkel der Präzision", "Formelbuch", "Kompass"]	f	1
530	PaulG	masterlol123	student	16	120	0	2025-11-29 21:38:52.875159	75	38	["Mutig", "Aufmerksam", "Kreativ"]	["Lampe", "Zirkel der Präzision", "Formelbuch"]	f	1
516	MatteoS	oscar123	student	15	135	0	2025-11-29 20:52:56.929375	64	38	["Kreativ", "Sorgfältig", "Zielstrebig"]	["Lampe", "Kompass", "Zirkel der Präzision"]	f	1
531	EmmaH	821mcs	student	16	160	0	2025-11-29 21:38:58.991605	73	38	["Strukturiert", "Zielstrebig", "Aufmerksam"]	["Rucksack", "Kompass", "Lampe"]	f	1
28	admin	bruhrain	admin	\N	0	0	2025-11-18 10:49:20.612583	\N	\N	\N	\N	f	1
554	elisa	8W7MtW	student	14	0	0	2025-12-03 08:18:10.667009	\N	\N	\N	\N	t	1
500	StellaG	stella	student	15	155	0	2025-11-29 20:50:19.956652	72	38	["Pragmatisch", "Analytisch", "Neugierig"]	["Rucksack", "Zirkel der Präzision", "Zauberstift"]	f	1
511	TimeaN	Nashoerner47	student	15	180	0	2025-11-29 20:52:02.226455	61	38	["Mutig", "Analytisch", "Neugierig"]	["Lineal", "Zirkel der Präzision", "Formelbuch"]	f	1
514	AmelieÖ	Lisalsa&Shaun	student	15	205	0	2025-11-29 20:52:41.522229	27	4	["Kreativ", "Sorgfältig", "Pragmatisch"]	["Zirkel der Präzision", "Rucksack", "Lampe"]	f	1
545	TimoS	Kanu1234	student	16	155	0	2025-11-29 21:40:51.632164	55	38	["Analytisch", "Optimistisch", "Mutig"]	["Lampe", "Lineal", "Kompass"]	f	1
205	fabian	blabla	student	14	215	0	2025-11-24 11:57:47.86164	44	4	["Pragmatisch", "Hilfsbereit", "Risikofreudig"]	["Lineal", "Zirkel der Präzision", "Zauberstift"]	f	1
234	volker	9PpQ8m	student	14	215	0	2025-11-25 07:38:29.995649	\N	4	\N	\N	t	1
520	AnnaW	Re1e-W	student	15	155	0	2025-11-29 20:53:26.819575	73	38	["Risikofreudig", "Ruhig", "Strukturiert"]	["Zauberstift", "Formelbuch", "Logikstein"]	f	1
527	FabianB	Willow1711	student	16	130	0	2025-11-29 21:38:27.780932	56	38	["Pragmatisch", "Aufmerksam", "Strukturiert"]	["Zauberstift", "Rucksack", "Lampe"]	f	1
539	JannisN	Familie2018	student	16	120	0	2025-11-29 21:40:04.535167	22	38	["Analytisch", "Ruhig", "Ausdauernd"]	["Zauberstift", "Kompass", "Formelbuch"]	f	1
503	EmiliaH	Ronya!!1614	student	15	175	0	2025-11-29 20:50:46.277886	27	38	["Neugierig", "Ausdauernd", "Risikofreudig"]	["Rucksack", "Logikstein", "Lineal"]	f	1
523	FerrisZ	472011	student	15	135	0	2025-11-29 20:53:53.369817	50	38	["Neugierig", "Analytisch", "Kreativ"]	["Zauberstift", "Logikstein", "Lampe"]	f	1
508	LisaL	AztUg	student	15	205	0	2025-11-29 20:51:38.517038	67	4	["Pragmatisch", "Mutig", "Strukturiert"]	["Logikstein", "Zauberstift", "Rechenamulett"]	f	1
532	LeviH	Levi17263	student	16	130	0	2025-11-29 21:39:07.772324	55	38	["Zielstrebig", "Ausdauernd", "Teamorientiert"]	["Lampe", "Rechenamulett", "Logikstein"]	f	1
466	bassi	blabla	student	14	455	0	2025-11-28 22:07:12.170961	22	5	["Kreativ", "Ausdauernd", "Teamorientiert"]	["Kompass", "Lampe", "Rechenamulett"]	f	1
497	SimonD	simon.simon!1	student	15	165	0	2025-11-29 20:49:04.464306	25	38	["Analytisch", "Pragmatisch", "Strukturiert"]	["Zirkel der Präzision", "Rechenamulett", "Logikstein"]	f	1
548	LevinW	levin1708	student	16	115	0	2025-11-29 21:41:15.768341	71	38	["Aufmerksam", "Ausdauernd", "Hilfsbereit"]	["Rucksack", "Logikstein", "Kompass"]	f	1
542	MiaR	sdjcjjs	student	16	345	0	2025-11-29 21:40:27.912743	48	5	["Strukturiert", "Ausdauernd", "Pragmatisch"]	["Zirkel der Präzision", "Kompass", "Rechenamulett"]	f	1
147	ueva42	bruhrain	superadmin	\N	0	0	2025-11-23 21:21:03.963055	\N	\N	\N	\N	f	1
564	eugen	blabla	student	14	225	0	2026-01-09 07:16:30.852273	34	4	["Neugierig", "Ausdauernd", "Kreativ"]	["Zirkel der Präzision", "Kompass", "Rucksack"]	f	1
517	SophieS	72wx3h	student	15	160	0	2025-11-29 20:53:06.022567	\N	38	\N	\N	t	1
168	blabla	g6QvXn	admin	\N	0	0	2025-11-23 22:02:24.657566	\N	\N	\N	\N	t	2
\.


--
-- Data for Name: xp_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.xp_transactions (id, student_id, mission_id, awarded_by, created_at, amount, source, school_id) FROM stdin;
114	208	\N	28	2025-11-26 09:03:49.929251	100	direct	1
115	208	\N	28	2025-11-28 10:14:21.307964	400	direct	1
122	466	\N	28	2025-11-28 22:40:19.066969	200	direct	1
123	201	\N	28	2025-11-28 22:40:19.274507	200	direct	1
124	208	\N	28	2025-11-28 22:40:19.478008	200	direct	1
125	205	\N	28	2025-11-28 22:40:19.689752	200	direct	1
126	463	\N	28	2025-11-28 22:40:19.905399	200	direct	1
127	454	\N	28	2025-11-28 22:40:20.110024	200	direct	1
128	202	\N	28	2025-11-28 22:40:20.313606	200	direct	1
129	234	\N	28	2025-11-28 22:40:20.525928	200	direct	1
116	201	\N	28	2025-11-28 21:47:42.895948	15	mission	1
117	208	\N	28	2025-11-28 21:47:43.089744	15	mission	1
118	205	\N	28	2025-11-28 21:47:43.279601	15	mission	1
119	454	\N	28	2025-11-28 21:47:43.474928	15	mission	1
120	202	\N	28	2025-11-28 21:47:43.672592	15	mission	1
121	234	\N	28	2025-11-28 21:47:43.85978	15	mission	1
131	535	31	28	2025-11-30 09:55:19.995452	5	mission	1
132	525	31	28	2025-11-30 09:55:20.184762	5	mission	1
133	529	31	28	2025-11-30 09:55:20.374726	5	mission	1
134	526	31	28	2025-11-30 09:55:20.561177	5	mission	1
135	531	31	28	2025-11-30 09:55:20.747318	5	mission	1
136	527	31	28	2025-11-30 09:55:20.93523	5	mission	1
137	528	31	28	2025-11-30 09:55:21.122822	5	mission	1
138	541	31	28	2025-11-30 09:55:21.308303	5	mission	1
139	540	31	28	2025-11-30 09:55:21.501187	5	mission	1
140	539	31	28	2025-11-30 09:55:21.692437	5	mission	1
141	538	31	28	2025-11-30 09:55:21.878237	5	mission	1
143	533	31	28	2025-11-30 09:55:22.255945	5	mission	1
144	543	31	28	2025-11-30 09:55:22.4449	5	mission	1
145	532	31	28	2025-11-30 09:55:22.627771	5	mission	1
146	548	31	28	2025-11-30 09:55:22.81445	5	mission	1
147	537	31	28	2025-11-30 09:55:23.002477	5	mission	1
148	542	31	28	2025-11-30 09:55:23.189687	5	mission	1
149	544	31	28	2025-11-30 09:55:23.374838	5	mission	1
150	530	31	28	2025-11-30 09:55:23.560754	5	mission	1
151	536	31	28	2025-11-30 09:55:23.749227	5	mission	1
152	549	31	28	2025-11-30 09:55:23.936582	5	mission	1
153	545	31	28	2025-11-30 09:55:24.121366	5	mission	1
154	534	31	28	2025-11-30 09:55:24.307677	5	mission	1
155	546	31	28	2025-11-30 09:55:24.492419	5	mission	1
156	535	36	28	2025-11-30 09:55:25.579211	25	mission	1
157	525	36	28	2025-11-30 09:55:25.761787	25	mission	1
158	529	36	28	2025-11-30 09:55:25.94569	25	mission	1
159	526	36	28	2025-11-30 09:55:26.131493	25	mission	1
160	531	36	28	2025-11-30 09:55:26.315619	25	mission	1
161	527	36	28	2025-11-30 09:55:26.498309	25	mission	1
162	528	36	28	2025-11-30 09:55:26.681208	25	mission	1
163	541	36	28	2025-11-30 09:55:26.865172	25	mission	1
164	540	36	28	2025-11-30 09:55:27.055332	25	mission	1
165	539	36	28	2025-11-30 09:55:27.235636	25	mission	1
166	538	36	28	2025-11-30 09:55:27.420639	25	mission	1
168	533	36	28	2025-11-30 09:55:27.787981	25	mission	1
169	543	36	28	2025-11-30 09:55:27.971194	25	mission	1
170	532	36	28	2025-11-30 09:55:28.15496	25	mission	1
171	548	36	28	2025-11-30 09:55:28.336856	25	mission	1
172	537	36	28	2025-11-30 09:55:28.520567	25	mission	1
173	542	36	28	2025-11-30 09:55:28.705046	25	mission	1
174	544	36	28	2025-11-30 09:55:28.893397	25	mission	1
175	530	36	28	2025-11-30 09:55:29.081788	25	mission	1
176	536	36	28	2025-11-30 09:55:29.272202	25	mission	1
177	549	36	28	2025-11-30 09:55:29.461161	25	mission	1
178	545	36	28	2025-11-30 09:55:29.643942	25	mission	1
179	534	36	28	2025-11-30 09:55:29.828563	25	mission	1
180	546	36	28	2025-11-30 09:55:30.017973	25	mission	1
181	535	31	28	2025-11-30 09:56:04.33627	5	mission	1
182	525	31	28	2025-11-30 09:56:04.522527	5	mission	1
183	529	31	28	2025-11-30 09:56:04.707558	5	mission	1
184	526	31	28	2025-11-30 09:56:04.891917	5	mission	1
185	531	31	28	2025-11-30 09:56:05.079276	5	mission	1
186	527	31	28	2025-11-30 09:56:05.264882	5	mission	1
187	528	31	28	2025-11-30 09:56:05.459331	5	mission	1
188	541	31	28	2025-11-30 09:56:05.642926	5	mission	1
189	540	31	28	2025-11-30 09:56:05.830489	5	mission	1
190	539	31	28	2025-11-30 09:56:06.015627	5	mission	1
191	538	31	28	2025-11-30 09:56:06.201511	5	mission	1
193	533	31	28	2025-11-30 09:56:06.573146	5	mission	1
194	543	31	28	2025-11-30 09:56:06.758207	5	mission	1
195	532	31	28	2025-11-30 09:56:06.941577	5	mission	1
196	548	31	28	2025-11-30 09:56:07.132963	5	mission	1
197	537	31	28	2025-11-30 09:56:07.31875	5	mission	1
198	542	31	28	2025-11-30 09:56:07.506197	5	mission	1
199	544	31	28	2025-11-30 09:56:07.687955	5	mission	1
200	530	31	28	2025-11-30 09:56:07.873207	5	mission	1
201	536	31	28	2025-11-30 09:56:08.059504	5	mission	1
202	549	31	28	2025-11-30 09:56:08.242447	5	mission	1
203	545	31	28	2025-11-30 09:56:08.426354	5	mission	1
204	534	31	28	2025-11-30 09:56:08.611491	5	mission	1
205	546	31	28	2025-11-30 09:56:08.794091	5	mission	1
206	535	31	28	2025-11-30 09:56:22.561796	5	mission	1
207	525	31	28	2025-11-30 09:56:22.746687	5	mission	1
208	529	31	28	2025-11-30 09:56:22.937754	5	mission	1
209	526	31	28	2025-11-30 09:56:23.125418	5	mission	1
210	531	31	28	2025-11-30 09:56:23.311652	5	mission	1
211	527	31	28	2025-11-30 09:56:23.496571	5	mission	1
212	528	31	28	2025-11-30 09:56:23.679578	5	mission	1
213	541	31	28	2025-11-30 09:56:23.862197	5	mission	1
214	540	31	28	2025-11-30 09:56:24.044423	5	mission	1
215	539	31	28	2025-11-30 09:56:24.228706	5	mission	1
216	538	31	28	2025-11-30 09:56:24.419674	5	mission	1
218	533	31	28	2025-11-30 09:56:24.785681	5	mission	1
219	543	31	28	2025-11-30 09:56:24.969655	5	mission	1
220	532	31	28	2025-11-30 09:56:25.161844	5	mission	1
221	548	31	28	2025-11-30 09:56:25.346266	5	mission	1
222	537	31	28	2025-11-30 09:56:25.527597	5	mission	1
223	542	31	28	2025-11-30 09:56:25.710318	5	mission	1
224	544	31	28	2025-11-30 09:56:25.895347	5	mission	1
225	530	31	28	2025-11-30 09:56:26.080618	5	mission	1
226	536	31	28	2025-11-30 09:56:26.270282	5	mission	1
227	549	31	28	2025-11-30 09:56:26.459766	5	mission	1
228	545	31	28	2025-11-30 09:56:26.643895	5	mission	1
229	534	31	28	2025-11-30 09:56:26.82681	5	mission	1
230	546	31	28	2025-11-30 09:56:27.010994	5	mission	1
231	535	31	28	2025-11-30 09:56:34.309996	5	mission	1
232	525	31	28	2025-11-30 09:56:34.500031	5	mission	1
233	529	31	28	2025-11-30 09:56:34.694751	5	mission	1
234	526	31	28	2025-11-30 09:56:34.886366	5	mission	1
235	531	31	28	2025-11-30 09:56:35.068686	5	mission	1
236	527	31	28	2025-11-30 09:56:35.248319	5	mission	1
237	528	31	28	2025-11-30 09:56:35.430967	5	mission	1
238	541	31	28	2025-11-30 09:56:35.616071	5	mission	1
239	540	31	28	2025-11-30 09:56:35.801403	5	mission	1
240	539	31	28	2025-11-30 09:56:35.986443	5	mission	1
241	538	31	28	2025-11-30 09:56:36.175425	5	mission	1
243	533	31	28	2025-11-30 09:56:36.544607	5	mission	1
244	543	31	28	2025-11-30 09:56:36.733554	5	mission	1
245	532	31	28	2025-11-30 09:56:36.916477	5	mission	1
246	548	31	28	2025-11-30 09:56:37.098883	5	mission	1
247	537	31	28	2025-11-30 09:56:37.281758	5	mission	1
248	542	31	28	2025-11-30 09:56:37.463462	5	mission	1
249	544	31	28	2025-11-30 09:56:37.6547	5	mission	1
250	530	31	28	2025-11-30 09:56:37.841248	5	mission	1
251	536	31	28	2025-11-30 09:56:38.027557	5	mission	1
252	549	31	28	2025-11-30 09:56:38.212245	5	mission	1
253	545	31	28	2025-11-30 09:56:38.395145	5	mission	1
254	534	31	28	2025-11-30 09:56:38.57914	5	mission	1
255	546	31	28	2025-11-30 09:56:38.764457	5	mission	1
256	535	31	28	2025-11-30 09:56:44.777339	5	mission	1
257	525	31	28	2025-11-30 09:56:44.963003	5	mission	1
258	529	31	28	2025-11-30 09:56:45.151664	5	mission	1
259	526	31	28	2025-11-30 09:56:45.335443	5	mission	1
260	531	31	28	2025-11-30 09:56:45.518255	5	mission	1
261	527	31	28	2025-11-30 09:56:45.701968	5	mission	1
262	528	31	28	2025-11-30 09:56:45.890903	5	mission	1
263	541	31	28	2025-11-30 09:56:46.075302	5	mission	1
264	540	31	28	2025-11-30 09:56:46.259751	5	mission	1
265	539	31	28	2025-11-30 09:56:46.439135	5	mission	1
266	538	31	28	2025-11-30 09:56:46.62375	5	mission	1
268	533	31	28	2025-11-30 09:56:46.991931	5	mission	1
269	543	31	28	2025-11-30 09:56:47.181493	5	mission	1
270	532	31	28	2025-11-30 09:56:47.363056	5	mission	1
271	548	31	28	2025-11-30 09:56:47.547862	5	mission	1
272	537	31	28	2025-11-30 09:56:47.732367	5	mission	1
273	542	31	28	2025-11-30 09:56:47.917107	5	mission	1
274	544	31	28	2025-11-30 09:56:48.100377	5	mission	1
275	530	31	28	2025-11-30 09:56:48.28772	5	mission	1
276	536	31	28	2025-11-30 09:56:48.469585	5	mission	1
277	549	31	28	2025-11-30 09:56:48.651961	5	mission	1
278	545	31	28	2025-11-30 09:56:48.837756	5	mission	1
279	534	31	28	2025-11-30 09:56:49.022798	5	mission	1
280	546	31	28	2025-11-30 09:56:49.216768	5	mission	1
281	535	32	28	2025-11-30 09:58:31.589521	5	mission	1
282	525	32	28	2025-11-30 09:58:31.785573	5	mission	1
283	529	32	28	2025-11-30 09:58:31.97247	5	mission	1
284	526	32	28	2025-11-30 09:58:32.16866	5	mission	1
285	531	32	28	2025-11-30 09:58:32.357889	5	mission	1
286	527	32	28	2025-11-30 09:58:32.551644	5	mission	1
287	528	32	28	2025-11-30 09:58:32.73931	5	mission	1
288	541	32	28	2025-11-30 09:58:32.92093	5	mission	1
289	540	32	28	2025-11-30 09:58:33.109908	5	mission	1
290	539	32	28	2025-11-30 09:58:33.293856	5	mission	1
291	538	32	28	2025-11-30 09:58:33.478069	5	mission	1
293	533	32	28	2025-11-30 09:58:33.854994	5	mission	1
294	543	32	28	2025-11-30 09:58:34.046452	5	mission	1
295	532	32	28	2025-11-30 09:58:34.237735	5	mission	1
296	548	32	28	2025-11-30 09:58:34.428385	5	mission	1
297	537	32	28	2025-11-30 09:58:34.61745	5	mission	1
298	542	32	28	2025-11-30 09:58:34.80336	5	mission	1
299	544	32	28	2025-11-30 09:58:34.99546	5	mission	1
300	530	32	28	2025-11-30 09:58:35.179913	5	mission	1
301	536	32	28	2025-11-30 09:58:35.379115	5	mission	1
302	549	32	28	2025-11-30 09:58:35.569601	5	mission	1
303	545	32	28	2025-11-30 09:58:35.754375	5	mission	1
304	534	32	28	2025-11-30 09:58:35.938007	5	mission	1
305	546	32	28	2025-11-30 09:58:36.12019	5	mission	1
306	529	32	28	2025-11-30 09:59:04.317603	5	mission	1
307	526	32	28	2025-11-30 09:59:04.56014	5	mission	1
308	527	32	28	2025-11-30 09:59:25.899667	5	mission	1
309	533	32	28	2025-11-30 09:59:26.165645	5	mission	1
310	532	32	28	2025-11-30 09:59:26.351911	5	mission	1
311	529	32	28	2025-11-30 09:59:52.452434	5	mission	1
312	526	32	28	2025-11-30 09:59:52.634597	5	mission	1
313	527	32	28	2025-11-30 09:59:52.817793	5	mission	1
314	533	32	28	2025-11-30 09:59:53.004048	5	mission	1
315	532	32	28	2025-11-30 09:59:53.190746	5	mission	1
316	495	\N	28	2025-12-12 11:01:16.240726	50	direct	1
317	496	\N	28	2025-12-12 11:01:30.78338	50	direct	1
318	497	\N	28	2025-12-12 11:01:41.14079	50	direct	1
319	498	\N	28	2025-12-12 11:02:01.301142	70	direct	1
320	499	\N	28	2025-12-12 11:02:17.894038	50	direct	1
321	500	\N	28	2025-12-12 11:02:30.534049	50	direct	1
322	501	\N	28	2025-12-12 11:02:41.058299	50	direct	1
323	502	\N	28	2025-12-12 11:03:06.21674	95	direct	1
324	503	\N	28	2025-12-12 11:03:20.898163	90	direct	1
325	505	\N	28	2025-12-12 11:04:15.900233	70	direct	1
326	506	\N	28	2025-12-12 11:04:42.400696	95	direct	1
327	507	\N	28	2025-12-12 11:04:55.47607	50	direct	1
328	508	\N	28	2025-12-12 11:05:32.480017	120	direct	1
329	509	\N	28	2025-12-12 11:05:43.161147	50	direct	1
330	510	\N	28	2025-12-12 11:06:41.43595	140	direct	1
331	511	\N	28	2025-12-12 11:06:56.206835	95	direct	1
332	512	\N	28	2025-12-12 11:07:08.754286	90	direct	1
333	513	\N	28	2025-12-12 11:07:23.392704	75	direct	1
334	515	\N	28	2025-12-12 11:07:34.864465	50	direct	1
335	516	\N	28	2025-12-12 11:07:49.399568	50	direct	1
336	517	\N	28	2025-12-12 11:08:03.76889	75	direct	1
337	518	\N	28	2025-12-12 11:08:17.524691	70	direct	1
338	519	\N	28	2025-12-12 11:08:26.268942	50	direct	1
339	520	\N	28	2025-12-12 11:08:47.718497	70	direct	1
340	500	\N	28	2025-12-12 11:08:55.041058	20	direct	1
341	521	\N	28	2025-12-12 11:09:57.027232	110	direct	1
342	522	\N	28	2025-12-12 11:10:08.308965	50	direct	1
343	523	\N	28	2025-12-12 11:10:19.030526	50	direct	1
344	514	\N	28	2025-12-12 11:10:40.308367	120	direct	1
345	504	\N	28	2025-12-12 11:10:57.982057	70	direct	1
346	562	\N	28	2025-12-12 11:45:51.01543	145	direct	1
347	531	\N	28	2025-12-12 11:46:05.048953	5	direct	1
348	532	\N	28	2025-12-12 11:46:11.14153	5	direct	1
349	542	\N	28	2025-12-12 11:46:42.325444	50	direct	1
350	542	\N	28	2025-12-12 11:47:48.874321	150	direct	1
351	545	\N	28	2025-12-12 11:48:04.651777	25	direct	1
352	535	31	28	2026-01-08 09:17:02.159827	5	mission	1
353	525	31	28	2026-01-08 09:17:02.369739	5	mission	1
354	529	31	28	2026-01-08 09:17:02.673193	5	mission	1
355	526	31	28	2026-01-08 09:17:02.880353	5	mission	1
356	531	31	28	2026-01-08 09:17:03.081407	5	mission	1
357	527	31	28	2026-01-08 09:17:03.265784	5	mission	1
358	528	31	28	2026-01-08 09:17:03.45602	5	mission	1
359	562	31	28	2026-01-08 09:17:03.712085	5	mission	1
360	541	31	28	2026-01-08 09:17:03.904178	5	mission	1
361	540	31	28	2026-01-08 09:17:04.094611	5	mission	1
362	539	31	28	2026-01-08 09:17:04.277482	5	mission	1
363	538	31	28	2026-01-08 09:17:04.576857	5	mission	1
364	563	31	28	2026-01-08 09:17:04.79993	5	mission	1
365	533	31	28	2026-01-08 09:17:05.028	5	mission	1
366	543	31	28	2026-01-08 09:17:05.330454	5	mission	1
367	532	31	28	2026-01-08 09:17:05.515599	5	mission	1
368	548	31	28	2026-01-08 09:17:05.7999	5	mission	1
369	537	31	28	2026-01-08 09:17:06.060173	5	mission	1
370	542	31	28	2026-01-08 09:17:06.387661	5	mission	1
371	544	31	28	2026-01-08 09:17:06.57684	5	mission	1
372	530	31	28	2026-01-08 09:17:06.878506	5	mission	1
373	536	31	28	2026-01-08 09:17:07.080606	5	mission	1
374	549	31	28	2026-01-08 09:17:07.280318	5	mission	1
375	545	31	28	2026-01-08 09:17:07.484977	5	mission	1
376	534	31	28	2026-01-08 09:17:07.672851	5	mission	1
377	546	31	28	2026-01-08 09:17:07.904943	5	mission	1
378	531	29	28	2026-01-08 09:17:33.080652	5	mission	1
379	542	29	28	2026-01-08 09:17:33.269575	5	mission	1
380	466	\N	28	2026-01-09 08:18:18.468808	200	direct	1
381	466	36	28	2026-01-09 08:56:19.794945	25	mission	1
382	564	\N	28	2026-01-09 10:13:59.85273	200	direct	1
383	564	36	28	2026-01-09 10:14:06.275611	25	mission	1
384	531	29	28	2026-01-09 11:34:50.361967	5	mission	1
385	542	29	28	2026-01-09 11:34:50.572254	5	mission	1
386	531	29	28	2026-01-09 11:35:19.109488	5	mission	1
387	542	29	28	2026-01-09 11:35:19.426451	5	mission	1
388	535	31	28	2026-01-09 11:35:36.463177	5	mission	1
389	525	31	28	2026-01-09 11:35:36.732078	5	mission	1
390	529	31	28	2026-01-09 11:35:36.933336	5	mission	1
391	526	31	28	2026-01-09 11:35:37.140762	5	mission	1
392	531	31	28	2026-01-09 11:35:37.374305	5	mission	1
393	527	31	28	2026-01-09 11:35:37.569585	5	mission	1
394	528	31	28	2026-01-09 11:35:37.763154	5	mission	1
395	562	31	28	2026-01-09 11:35:37.957849	5	mission	1
396	541	31	28	2026-01-09 11:35:38.167725	5	mission	1
397	540	31	28	2026-01-09 11:35:38.37217	5	mission	1
398	539	31	28	2026-01-09 11:35:38.569998	5	mission	1
399	538	31	28	2026-01-09 11:35:38.777991	5	mission	1
400	563	31	28	2026-01-09 11:35:39.027902	5	mission	1
401	533	31	28	2026-01-09 11:35:39.232146	5	mission	1
402	543	31	28	2026-01-09 11:35:39.424717	5	mission	1
403	532	31	28	2026-01-09 11:35:39.617386	5	mission	1
404	548	31	28	2026-01-09 11:35:39.809434	5	mission	1
405	537	31	28	2026-01-09 11:35:40.007688	5	mission	1
406	542	31	28	2026-01-09 11:35:40.213273	5	mission	1
407	544	31	28	2026-01-09 11:35:40.436353	5	mission	1
408	530	31	28	2026-01-09 11:35:40.636307	5	mission	1
409	536	31	28	2026-01-09 11:35:40.850781	5	mission	1
410	549	31	28	2026-01-09 11:35:41.048657	5	mission	1
411	545	31	28	2026-01-09 11:35:41.238644	5	mission	1
412	534	31	28	2026-01-09 11:35:41.427979	5	mission	1
413	546	31	28	2026-01-09 11:35:41.61538	5	mission	1
414	466	32	28	2026-01-09 12:23:19.432377	5	mission	1
415	466	36	28	2026-01-09 12:41:32.87801	25	mission	1
416	515	31	28	2026-01-12 09:50:28.048574	5	mission	1
417	498	31	28	2026-01-12 09:50:28.243765	5	mission	1
418	514	31	28	2026-01-12 09:50:28.433969	5	mission	1
419	502	31	28	2026-01-12 09:50:28.637468	5	mission	1
420	520	31	28	2026-01-12 09:50:28.848517	5	mission	1
421	510	31	28	2026-01-12 09:50:29.049184	5	mission	1
422	503	31	28	2026-01-12 09:50:29.283973	5	mission	1
423	523	31	28	2026-01-12 09:50:29.475172	5	mission	1
424	509	31	28	2026-01-12 09:50:29.67139	5	mission	1
425	512	31	28	2026-01-12 09:50:29.878988	5	mission	1
426	506	31	28	2026-01-12 09:50:30.078045	5	mission	1
427	495	31	28	2026-01-12 09:50:30.374974	5	mission	1
428	499	31	28	2026-01-12 09:50:30.609312	5	mission	1
429	508	31	28	2026-01-12 09:50:30.892153	5	mission	1
430	496	31	28	2026-01-12 09:50:31.10134	5	mission	1
431	505	31	28	2026-01-12 09:50:31.400922	5	mission	1
432	507	31	28	2026-01-12 09:50:31.606696	5	mission	1
433	521	31	28	2026-01-12 09:50:31.916492	5	mission	1
434	516	31	28	2026-01-12 09:50:32.135815	5	mission	1
435	501	31	28	2026-01-12 09:50:32.472837	5	mission	1
436	522	31	28	2026-01-12 09:50:32.666406	5	mission	1
437	518	31	28	2026-01-12 09:50:32.950313	5	mission	1
438	504	31	28	2026-01-12 09:50:33.147977	5	mission	1
439	497	31	28	2026-01-12 09:50:33.348895	5	mission	1
440	517	31	28	2026-01-12 09:50:33.557529	5	mission	1
441	561	31	28	2026-01-12 09:50:33.761277	5	mission	1
442	500	31	28	2026-01-12 09:50:33.998138	5	mission	1
443	511	31	28	2026-01-12 09:50:34.200604	5	mission	1
444	513	31	28	2026-01-12 09:50:34.574056	5	mission	1
445	519	31	28	2026-01-12 09:50:34.782381	5	mission	1
446	515	36	28	2026-01-12 09:50:40.325316	25	mission	1
447	498	36	28	2026-01-12 09:50:40.523242	25	mission	1
448	514	36	28	2026-01-12 09:50:40.827421	25	mission	1
449	502	36	28	2026-01-12 09:50:41.036998	25	mission	1
450	520	36	28	2026-01-12 09:50:41.238271	25	mission	1
451	510	36	28	2026-01-12 09:50:41.43942	25	mission	1
452	503	36	28	2026-01-12 09:50:41.652036	25	mission	1
453	523	36	28	2026-01-12 09:50:41.86448	25	mission	1
454	509	36	28	2026-01-12 09:50:42.082158	25	mission	1
455	512	36	28	2026-01-12 09:50:42.289937	25	mission	1
456	506	36	28	2026-01-12 09:50:42.496235	25	mission	1
457	495	36	28	2026-01-12 09:50:42.705199	25	mission	1
458	499	36	28	2026-01-12 09:50:42.912944	25	mission	1
459	508	36	28	2026-01-12 09:50:43.138604	25	mission	1
460	496	36	28	2026-01-12 09:50:43.512993	25	mission	1
461	505	36	28	2026-01-12 09:50:43.70577	25	mission	1
462	507	36	28	2026-01-12 09:50:44.013036	25	mission	1
463	521	36	28	2026-01-12 09:50:44.217093	25	mission	1
464	516	36	28	2026-01-12 09:50:44.728533	25	mission	1
465	501	36	28	2026-01-12 09:50:45.078556	25	mission	1
466	522	36	28	2026-01-12 09:50:45.343605	25	mission	1
467	518	36	28	2026-01-12 09:50:45.593004	25	mission	1
468	504	36	28	2026-01-12 09:50:45.886377	25	mission	1
469	497	36	28	2026-01-12 09:50:46.077414	25	mission	1
470	517	36	28	2026-01-12 09:50:46.269495	25	mission	1
471	561	36	28	2026-01-12 09:50:46.468822	25	mission	1
472	500	36	28	2026-01-12 09:50:46.66209	25	mission	1
473	511	36	28	2026-01-12 09:50:46.872028	25	mission	1
474	513	36	28	2026-01-12 09:50:47.105153	25	mission	1
475	519	36	28	2026-01-12 09:50:47.30848	25	mission	1
476	515	36	28	2026-01-12 09:50:47.689041	25	mission	1
477	498	36	28	2026-01-12 09:50:47.898474	25	mission	1
478	514	36	28	2026-01-12 09:50:48.214044	25	mission	1
479	502	36	28	2026-01-12 09:50:48.508248	25	mission	1
480	520	36	28	2026-01-12 09:50:48.718756	25	mission	1
481	510	36	28	2026-01-12 09:50:48.926502	25	mission	1
482	503	36	28	2026-01-12 09:50:49.237597	25	mission	1
483	523	36	28	2026-01-12 09:50:49.429526	25	mission	1
484	509	36	28	2026-01-12 09:50:49.74539	25	mission	1
485	512	36	28	2026-01-12 09:50:49.945114	25	mission	1
486	506	36	28	2026-01-12 09:50:50.254221	25	mission	1
487	495	36	28	2026-01-12 09:50:50.458436	25	mission	1
488	499	36	28	2026-01-12 09:50:50.659287	25	mission	1
489	508	36	28	2026-01-12 09:50:50.866696	25	mission	1
490	496	36	28	2026-01-12 09:50:51.076208	25	mission	1
491	505	36	28	2026-01-12 09:50:51.306067	25	mission	1
492	507	36	28	2026-01-12 09:50:51.504514	25	mission	1
493	521	36	28	2026-01-12 09:50:51.696249	25	mission	1
494	516	36	28	2026-01-12 09:50:51.893271	25	mission	1
495	501	36	28	2026-01-12 09:50:52.093565	25	mission	1
496	522	36	28	2026-01-12 09:50:52.431578	25	mission	1
497	518	36	28	2026-01-12 09:50:52.627946	25	mission	1
498	504	36	28	2026-01-12 09:50:52.921878	25	mission	1
499	497	36	28	2026-01-12 09:50:53.12344	25	mission	1
500	517	36	28	2026-01-12 09:50:53.418325	25	mission	1
501	561	36	28	2026-01-12 09:50:53.631253	25	mission	1
502	500	36	28	2026-01-12 09:50:53.945824	25	mission	1
503	511	36	28	2026-01-12 09:50:54.160065	25	mission	1
504	531	29	28	2026-01-12 11:06:50.048167	5	mission	1
505	542	29	28	2026-01-12 11:06:50.312999	5	mission	1
506	525	31	28	2026-01-12 11:08:07.541309	5	mission	1
507	529	31	28	2026-01-12 11:08:07.740556	5	mission	1
508	531	31	28	2026-01-12 11:08:07.941156	5	mission	1
509	527	31	28	2026-01-12 11:08:08.154556	5	mission	1
510	528	31	28	2026-01-12 11:08:08.383521	5	mission	1
511	562	31	28	2026-01-12 11:08:08.572983	5	mission	1
512	541	31	28	2026-01-12 11:08:08.769207	5	mission	1
513	539	31	28	2026-01-12 11:08:08.968647	5	mission	1
514	538	31	28	2026-01-12 11:08:09.175415	5	mission	1
515	563	31	28	2026-01-12 11:08:09.407324	5	mission	1
516	533	31	28	2026-01-12 11:08:09.598117	5	mission	1
517	542	31	28	2026-01-12 11:08:09.782948	5	mission	1
518	544	31	28	2026-01-12 11:08:09.989379	5	mission	1
519	530	31	28	2026-01-12 11:08:10.221642	5	mission	1
520	549	31	28	2026-01-12 11:08:10.503153	5	mission	1
521	545	31	28	2026-01-12 11:08:10.704018	5	mission	1
522	534	31	28	2026-01-12 11:08:10.913371	5	mission	1
523	546	31	28	2026-01-12 11:08:11.123828	5	mission	1
524	531	29	28	2026-01-19 11:39:22.413987	5	mission	1
525	542	29	28	2026-01-19 11:39:22.862656	5	mission	1
526	535	31	28	2026-01-19 11:40:42.53682	5	mission	1
527	525	31	28	2026-01-19 11:40:43.147917	5	mission	1
528	529	31	28	2026-01-19 11:40:43.459624	5	mission	1
529	526	31	28	2026-01-19 11:40:43.759586	5	mission	1
530	531	31	28	2026-01-19 11:40:44.172274	5	mission	1
531	527	31	28	2026-01-19 11:40:44.577738	5	mission	1
532	528	31	28	2026-01-19 11:40:44.987321	5	mission	1
533	562	31	28	2026-01-19 11:40:45.296437	5	mission	1
534	541	31	28	2026-01-19 11:40:45.702155	5	mission	1
535	540	31	28	2026-01-19 11:40:46.010868	5	mission	1
536	539	31	28	2026-01-19 11:40:46.41902	5	mission	1
537	538	31	28	2026-01-19 11:40:46.727002	5	mission	1
538	563	31	28	2026-01-19 11:40:47.241493	5	mission	1
539	533	31	28	2026-01-19 11:40:47.753552	5	mission	1
540	543	31	28	2026-01-19 11:40:48.281858	5	mission	1
541	532	31	28	2026-01-19 11:40:49.443219	5	mission	1
542	535	31	28	2026-01-19 11:40:50.216787	5	mission	1
543	548	31	28	2026-01-19 11:40:50.231624	5	mission	1
544	537	31	28	2026-01-19 11:40:50.521742	5	mission	1
545	525	31	28	2026-01-19 11:40:50.524466	5	mission	1
546	542	31	28	2026-01-19 11:40:51.548957	5	mission	1
547	529	31	28	2026-01-19 11:40:51.54976	5	mission	1
548	526	31	28	2026-01-19 11:40:52.053351	5	mission	1
549	544	31	28	2026-01-19 11:40:52.053596	5	mission	1
550	530	31	28	2026-01-19 11:40:53.486347	5	mission	1
551	531	31	28	2026-01-19 11:40:53.486342	5	mission	1
552	536	31	28	2026-01-19 11:40:53.999187	5	mission	1
553	527	31	28	2026-01-19 11:40:53.999183	5	mission	1
554	549	31	28	2026-01-19 11:40:54.613237	5	mission	1
555	528	31	28	2026-01-19 11:40:54.615102	5	mission	1
556	562	31	28	2026-01-19 11:40:55.028171	5	mission	1
557	545	31	28	2026-01-19 11:40:55.028064	5	mission	1
558	534	31	28	2026-01-19 11:40:55.329	5	mission	1
559	541	31	28	2026-01-19 11:40:55.329954	5	mission	1
560	540	31	28	2026-01-19 11:40:55.739938	5	mission	1
561	546	31	28	2026-01-19 11:40:55.740216	5	mission	1
562	539	31	28	2026-01-19 11:40:56.558536	5	mission	1
563	538	31	28	2026-01-19 11:40:56.86603	5	mission	1
564	563	31	28	2026-01-19 11:40:57.172721	5	mission	1
565	533	31	28	2026-01-19 11:40:57.787932	5	mission	1
566	543	31	28	2026-01-19 11:40:58.30587	5	mission	1
567	535	36	28	2026-01-19 11:40:59.070868	25	mission	1
568	532	31	28	2026-01-19 11:40:59.074623	5	mission	1
569	548	31	28	2026-01-19 11:40:59.327163	5	mission	1
570	525	36	28	2026-01-19 11:40:59.327171	25	mission	1
571	537	31	28	2026-01-19 11:40:59.947349	5	mission	1
572	529	36	28	2026-01-19 11:40:59.947605	25	mission	1
573	542	31	28	2026-01-19 11:41:00.247485	5	mission	1
574	526	36	28	2026-01-19 11:41:00.248139	25	mission	1
575	531	36	28	2026-01-19 11:41:00.867149	25	mission	1
576	544	31	28	2026-01-19 11:41:00.867821	5	mission	1
577	530	31	28	2026-01-19 11:41:01.272399	5	mission	1
578	527	36	28	2026-01-19 11:41:01.272442	25	mission	1
579	528	36	28	2026-01-19 11:41:01.781958	25	mission	1
580	536	31	28	2026-01-19 11:41:01.782406	5	mission	1
581	549	31	28	2026-01-19 11:41:02.093386	5	mission	1
582	562	36	28	2026-01-19 11:41:02.094016	25	mission	1
583	541	36	28	2026-01-19 11:41:02.403044	25	mission	1
584	545	31	28	2026-01-19 11:41:02.403228	5	mission	1
585	534	31	28	2026-01-19 11:41:03.009789	5	mission	1
586	540	36	28	2026-01-19 11:41:03.013783	25	mission	1
587	539	36	28	2026-01-19 11:41:03.417907	25	mission	1
588	546	31	28	2026-01-19 11:41:03.418421	5	mission	1
589	538	36	28	2026-01-19 11:41:03.731125	25	mission	1
590	563	36	28	2026-01-19 11:41:04.136421	25	mission	1
591	533	36	28	2026-01-19 11:41:04.444643	25	mission	1
592	543	36	28	2026-01-19 11:41:04.653606	25	mission	1
593	532	36	28	2026-01-19 11:41:04.960185	25	mission	1
594	548	36	28	2026-01-19 11:41:05.165586	25	mission	1
595	537	36	28	2026-01-19 11:41:05.572835	25	mission	1
596	542	36	28	2026-01-19 11:41:05.981975	25	mission	1
597	544	36	28	2026-01-19 11:41:06.496447	25	mission	1
598	530	36	28	2026-01-19 11:41:06.799794	25	mission	1
599	536	36	28	2026-01-19 11:41:07.515931	25	mission	1
600	549	36	28	2026-01-19 11:41:08.032594	25	mission	1
601	545	36	28	2026-01-19 11:41:08.338588	25	mission	1
602	534	36	28	2026-01-19 11:41:08.647435	25	mission	1
603	546	36	28	2026-01-19 11:41:09.264376	25	mission	1
604	497	29	28	2026-01-19 11:42:37.088163	5	mission	1
605	513	29	28	2026-01-19 11:42:37.425624	5	mission	1
606	513	29	28	2026-01-19 11:42:48.658022	5	mission	1
607	513	29	28	2026-01-19 11:43:09.549614	5	mission	1
608	510	\N	28	2026-01-19 11:43:58.890078	20	direct	1
609	515	\N	28	2026-01-19 11:44:47.678378	5	direct	1
610	498	\N	28	2026-01-19 11:44:47.981898	5	direct	1
611	514	\N	28	2026-01-19 11:44:48.186824	5	direct	1
612	502	\N	28	2026-01-19 11:44:48.493735	5	direct	1
613	520	\N	28	2026-01-19 11:44:48.907708	5	direct	1
614	510	\N	28	2026-01-19 11:44:49.209883	5	direct	1
615	503	\N	28	2026-01-19 11:44:49.516978	5	direct	1
616	523	\N	28	2026-01-19 11:44:50.0289	5	direct	1
617	509	\N	28	2026-01-19 11:44:50.242425	5	direct	1
618	512	\N	28	2026-01-19 11:44:50.539943	5	direct	1
619	506	\N	28	2026-01-19 11:44:50.954531	5	direct	1
620	495	\N	28	2026-01-19 11:44:51.257763	5	direct	1
621	499	\N	28	2026-01-19 11:44:51.563929	5	direct	1
622	508	\N	28	2026-01-19 11:44:52.288784	5	direct	1
623	496	\N	28	2026-01-19 11:44:52.591464	5	direct	1
624	515	\N	28	2026-01-19 11:44:52.793785	5	direct	1
625	505	\N	28	2026-01-19 11:44:52.961734	5	direct	1
626	498	\N	28	2026-01-19 11:44:53.207609	5	direct	1
627	507	\N	28	2026-01-19 11:44:53.20874	5	direct	1
628	515	\N	28	2026-01-19 11:44:53.230424	5	direct	1
629	514	\N	28	2026-01-19 11:44:53.613696	5	direct	1
630	498	\N	28	2026-01-19 11:44:53.618121	5	direct	1
631	521	\N	28	2026-01-19 11:44:53.619477	5	direct	1
632	515	\N	28	2026-01-19 11:44:53.633166	5	direct	1
633	502	\N	28	2026-01-19 11:44:55.149718	5	direct	1
634	498	\N	28	2026-01-19 11:44:55.151415	5	direct	1
635	516	\N	28	2026-01-19 11:44:55.152371	5	direct	1
636	514	\N	28	2026-01-19 11:44:55.152595	5	direct	1
637	520	\N	28	2026-01-19 11:44:55.462703	5	direct	1
644	502	\N	28	2026-01-19 11:44:55.774028	5	direct	1
648	503	\N	28	2026-01-19 11:44:56.076892	5	direct	1
649	504	\N	28	2026-01-19 11:44:56.380727	5	direct	1
653	497	\N	28	2026-01-19 11:44:56.792987	5	direct	1
657	512	\N	28	2026-01-19 11:44:57.09716	5	direct	1
662	509	\N	28	2026-01-19 11:44:57.507918	5	direct	1
666	495	\N	28	2026-01-19 11:44:57.812406	5	direct	1
672	495	\N	28	2026-01-19 11:44:58.130241	5	direct	1
674	495	\N	28	2026-01-19 11:44:58.430157	5	direct	1
678	499	\N	28	2026-01-19 11:44:58.738116	5	direct	1
638	502	\N	28	2026-01-19 11:44:55.462807	5	direct	1
641	510	\N	28	2026-01-19 11:44:55.772515	5	direct	1
647	520	\N	28	2026-01-19 11:44:56.073976	5	direct	1
651	523	\N	28	2026-01-19 11:44:56.381872	5	direct	1
656	523	\N	28	2026-01-19 11:44:56.793007	5	direct	1
660	517	\N	28	2026-01-19 11:44:57.099978	5	direct	1
661	506	\N	28	2026-01-19 11:44:57.507913	5	direct	1
668	500	\N	28	2026-01-19 11:44:57.813784	5	direct	1
669	506	\N	28	2026-01-19 11:44:58.124858	5	direct	1
675	499	\N	28	2026-01-19 11:44:58.430481	5	direct	1
679	508	\N	28	2026-01-19 11:44:58.738717	5	direct	1
683	505	\N	28	2026-01-19 11:44:59.2496	5	direct	1
702	518	\N	28	2026-01-19 11:45:01.60924	5	direct	1
704	504	\N	28	2026-01-19 11:45:01.909953	5	direct	1
708	497	\N	28	2026-01-19 11:45:02.320596	5	direct	1
711	517	\N	28	2026-01-19 11:45:02.735896	5	direct	1
713	497	\N	28	2026-01-19 11:45:03.042833	5	direct	1
717	500	\N	28	2026-01-19 11:45:03.357177	5	direct	1
719	511	\N	28	2026-01-19 11:45:03.757968	5	direct	1
722	513	\N	28	2026-01-19 11:45:04.163924	5	direct	1
726	519	\N	28	2026-01-19 11:45:04.468631	5	direct	1
727	513	\N	28	2026-01-19 11:45:04.783582	5	direct	1
728	519	\N	28	2026-01-19 11:45:05.414895	5	direct	1
640	501	\N	28	2026-01-19 11:44:55.464419	5	direct	1
642	520	\N	28	2026-01-19 11:44:55.772628	5	direct	1
645	518	\N	28	2026-01-19 11:44:56.073068	5	direct	1
650	510	\N	28	2026-01-19 11:44:56.381833	5	direct	1
654	509	\N	28	2026-01-19 11:44:56.792979	5	direct	1
659	523	\N	28	2026-01-19 11:44:57.099651	5	direct	1
663	512	\N	28	2026-01-19 11:44:57.508693	5	direct	1
665	506	\N	28	2026-01-19 11:44:57.812396	5	direct	1
670	499	\N	28	2026-01-19 11:44:58.125339	5	direct	1
673	513	\N	28	2026-01-19 11:44:58.429464	5	direct	1
680	496	\N	28	2026-01-19 11:44:58.738723	5	direct	1
681	496	\N	28	2026-01-19 11:44:59.248954	5	direct	1
685	507	\N	28	2026-01-19 11:44:59.715516	5	direct	1
689	505	\N	28	2026-01-19 11:45:00.070395	5	direct	1
690	521	\N	28	2026-01-19 11:45:00.274138	5	direct	1
691	516	\N	28	2026-01-19 11:45:00.372129	5	direct	1
694	521	\N	28	2026-01-19 11:45:00.784585	5	direct	1
698	516	\N	28	2026-01-19 11:45:01.191585	5	direct	1
701	501	\N	28	2026-01-19 11:45:01.607022	5	direct	1
705	504	\N	28	2026-01-19 11:45:01.910733	5	direct	1
706	518	\N	28	2026-01-19 11:45:02.319935	5	direct	1
709	504	\N	28	2026-01-19 11:45:02.735332	5	direct	1
714	561	\N	28	2026-01-19 11:45:03.04358	5	direct	1
716	517	\N	28	2026-01-19 11:45:03.35372	5	direct	1
720	511	\N	28	2026-01-19 11:45:03.758028	5	direct	1
721	500	\N	28	2026-01-19 11:45:04.161353	5	direct	1
725	519	\N	28	2026-01-19 11:45:04.468169	5	direct	1
835	504	31	28	2026-01-21 11:36:53.600263	5	mission	1
836	497	31	28	2026-01-21 11:36:53.807632	5	mission	1
837	517	31	28	2026-01-21 11:36:54.009963	5	mission	1
838	561	31	28	2026-01-21 11:36:54.220968	5	mission	1
839	500	31	28	2026-01-21 11:36:54.448785	5	mission	1
840	511	31	28	2026-01-21 11:36:54.64882	5	mission	1
841	513	31	28	2026-01-21 11:36:54.847283	5	mission	1
842	519	31	28	2026-01-21 11:36:55.040162	5	mission	1
843	549	35	28	2026-01-21 11:38:36.474506	5	mission	1
844	549	35	28	2026-01-21 11:39:09.073395	5	mission	1
845	531	\N	28	2026-02-03 06:41:04.52651	10	direct	1
846	546	\N	28	2026-02-03 06:42:00.506143	20	direct	1
847	510	\N	28	2026-02-03 06:42:40.324228	15	direct	1
848	497	\N	28	2026-02-03 06:43:06.883944	15	direct	1
849	515	31	28	2026-02-03 06:43:23.04989	5	mission	1
850	498	31	28	2026-02-03 06:43:23.241338	5	mission	1
851	514	31	28	2026-02-03 06:43:23.478023	5	mission	1
852	502	31	28	2026-02-03 06:43:23.667016	5	mission	1
853	520	31	28	2026-02-03 06:43:23.860763	5	mission	1
854	510	31	28	2026-02-03 06:43:24.405035	5	mission	1
855	503	31	28	2026-02-03 06:43:24.597067	5	mission	1
856	523	31	28	2026-02-03 06:43:24.851083	5	mission	1
857	509	31	28	2026-02-03 06:43:25.092572	5	mission	1
858	512	31	28	2026-02-03 06:43:25.379569	5	mission	1
859	506	31	28	2026-02-03 06:43:25.572142	5	mission	1
860	495	31	28	2026-02-03 06:43:25.908282	5	mission	1
861	499	31	28	2026-02-03 06:43:26.106318	5	mission	1
862	508	31	28	2026-02-03 06:43:26.310079	5	mission	1
863	496	31	28	2026-02-03 06:43:26.615246	5	mission	1
864	505	31	28	2026-02-03 06:43:26.805407	5	mission	1
865	507	31	28	2026-02-03 06:43:27.033282	5	mission	1
866	521	31	28	2026-02-03 06:43:27.219027	5	mission	1
867	516	31	28	2026-02-03 06:43:27.457908	5	mission	1
868	501	31	28	2026-02-03 06:43:27.677103	5	mission	1
869	522	31	28	2026-02-03 06:43:27.8742	5	mission	1
870	518	31	28	2026-02-03 06:43:28.07441	5	mission	1
871	504	31	28	2026-02-03 06:43:28.35327	5	mission	1
872	497	31	28	2026-02-03 06:43:28.588263	5	mission	1
873	517	31	28	2026-02-03 06:43:28.781314	5	mission	1
874	561	31	28	2026-02-03 06:43:29.054282	5	mission	1
875	500	31	28	2026-02-03 06:43:29.242603	5	mission	1
876	511	31	28	2026-02-03 06:43:29.43229	5	mission	1
877	513	31	28	2026-02-03 06:43:29.644238	5	mission	1
878	519	31	28	2026-02-03 06:43:29.833166	5	mission	1
879	510	29	28	2026-02-04 06:25:03.527872	5	mission	1
880	545	\N	28	2026-02-04 06:25:39.873927	10	direct	1
639	514	\N	28	2026-01-19 11:44:55.462693	5	direct	1
643	522	\N	28	2026-01-19 11:44:55.774023	5	direct	1
646	510	\N	28	2026-01-19 11:44:56.073864	5	direct	1
652	503	\N	28	2026-01-19 11:44:56.382018	5	direct	1
655	503	\N	28	2026-01-19 11:44:56.793084	5	direct	1
658	509	\N	28	2026-01-19 11:44:57.09842	5	direct	1
664	561	\N	28	2026-01-19 11:44:57.508804	5	direct	1
667	512	\N	28	2026-01-19 11:44:57.812572	5	direct	1
671	511	\N	28	2026-01-19 11:44:58.129825	5	direct	1
676	508	\N	28	2026-01-19 11:44:58.431245	5	direct	1
677	519	\N	28	2026-01-19 11:44:58.737952	5	direct	1
682	508	\N	28	2026-01-19 11:44:59.249566	5	direct	1
684	505	\N	28	2026-01-19 11:44:59.563785	5	direct	1
687	507	\N	28	2026-01-19 11:44:59.961567	5	direct	1
688	521	\N	28	2026-01-19 11:45:00.067633	5	direct	1
692	507	\N	28	2026-01-19 11:45:00.37335	5	direct	1
693	516	\N	28	2026-01-19 11:45:00.579603	5	direct	1
695	501	\N	28	2026-01-19 11:45:00.789712	5	direct	1
696	501	\N	28	2026-01-19 11:45:00.98913	5	direct	1
697	522	\N	28	2026-01-19 11:45:01.191226	5	direct	1
699	522	\N	28	2026-01-19 11:45:01.399168	5	direct	1
700	518	\N	28	2026-01-19 11:45:01.602985	5	direct	1
703	522	\N	28	2026-01-19 11:45:01.909838	5	direct	1
707	497	\N	28	2026-01-19 11:45:02.320099	5	direct	1
710	517	\N	28	2026-01-19 11:45:02.734752	5	direct	1
712	561	\N	28	2026-01-19 11:45:03.042345	5	direct	1
715	500	\N	28	2026-01-19 11:45:03.352874	5	direct	1
718	561	\N	28	2026-01-19 11:45:03.75599	5	direct	1
723	513	\N	28	2026-01-19 11:45:04.165183	5	direct	1
724	511	\N	28	2026-01-19 11:45:04.467591	5	direct	1
686	496	\N	28	2026-01-19 11:44:59.772122	5	direct	1
729	535	29	28	2026-01-21 11:34:25.844537	5	mission	1
730	525	29	28	2026-01-21 11:34:26.143684	5	mission	1
731	529	29	28	2026-01-21 11:34:26.354292	5	mission	1
732	526	29	28	2026-01-21 11:34:26.654378	5	mission	1
733	531	29	28	2026-01-21 11:34:26.858845	5	mission	1
734	527	29	28	2026-01-21 11:34:27.16227	5	mission	1
735	528	29	28	2026-01-21 11:34:27.475177	5	mission	1
736	562	29	28	2026-01-21 11:34:27.705725	5	mission	1
737	541	29	28	2026-01-21 11:34:27.913206	5	mission	1
738	540	29	28	2026-01-21 11:34:28.22111	5	mission	1
739	539	29	28	2026-01-21 11:34:28.504095	5	mission	1
740	538	29	28	2026-01-21 11:34:28.736517	5	mission	1
741	563	29	28	2026-01-21 11:34:28.949097	5	mission	1
742	533	29	28	2026-01-21 11:34:29.153261	5	mission	1
743	543	29	28	2026-01-21 11:34:29.354693	5	mission	1
744	532	29	28	2026-01-21 11:34:29.564154	5	mission	1
745	548	29	28	2026-01-21 11:34:29.827892	5	mission	1
746	537	29	28	2026-01-21 11:34:30.142877	5	mission	1
747	542	29	28	2026-01-21 11:34:30.344213	5	mission	1
748	544	29	28	2026-01-21 11:34:30.549779	5	mission	1
749	530	29	28	2026-01-21 11:34:30.861866	5	mission	1
750	536	29	28	2026-01-21 11:34:31.072732	5	mission	1
751	549	29	28	2026-01-21 11:34:31.366946	5	mission	1
752	545	29	28	2026-01-21 11:34:31.575323	5	mission	1
753	534	29	28	2026-01-21 11:34:31.779833	5	mission	1
754	546	29	28	2026-01-21 11:34:32.003358	5	mission	1
755	535	29	28	2026-01-21 11:34:51.341839	5	mission	1
756	525	29	28	2026-01-21 11:34:51.541689	5	mission	1
757	529	29	28	2026-01-21 11:34:51.861597	5	mission	1
758	526	29	28	2026-01-21 11:34:52.053643	5	mission	1
759	531	29	28	2026-01-21 11:34:52.358015	5	mission	1
760	527	29	28	2026-01-21 11:34:52.559256	5	mission	1
761	528	29	28	2026-01-21 11:34:52.884551	5	mission	1
762	562	29	28	2026-01-21 11:34:53.08008	5	mission	1
763	541	29	28	2026-01-21 11:34:53.383461	5	mission	1
764	540	29	28	2026-01-21 11:34:53.588775	5	mission	1
765	539	29	28	2026-01-21 11:34:53.793698	5	mission	1
766	538	29	28	2026-01-21 11:34:53.993353	5	mission	1
767	563	29	28	2026-01-21 11:34:54.199113	5	mission	1
768	533	29	28	2026-01-21 11:34:54.416804	5	mission	1
769	543	29	28	2026-01-21 11:34:54.608999	5	mission	1
770	532	29	28	2026-01-21 11:34:54.813142	5	mission	1
771	548	29	28	2026-01-21 11:34:55.020099	5	mission	1
772	537	29	28	2026-01-21 11:34:55.227854	5	mission	1
773	542	29	28	2026-01-21 11:34:55.471554	5	mission	1
774	544	29	28	2026-01-21 11:34:55.67663	5	mission	1
775	530	29	28	2026-01-21 11:34:55.875993	5	mission	1
776	536	29	28	2026-01-21 11:34:56.077719	5	mission	1
777	549	29	28	2026-01-21 11:34:56.275362	5	mission	1
778	545	29	28	2026-01-21 11:34:56.55918	5	mission	1
779	534	29	28	2026-01-21 11:34:56.768753	5	mission	1
780	546	29	28	2026-01-21 11:34:57.084322	5	mission	1
781	535	31	28	2026-01-21 11:35:09.676263	5	mission	1
782	525	31	28	2026-01-21 11:35:09.882728	5	mission	1
783	529	31	28	2026-01-21 11:35:10.174976	5	mission	1
784	526	31	28	2026-01-21 11:35:10.379366	5	mission	1
785	531	31	28	2026-01-21 11:35:10.688879	5	mission	1
786	527	31	28	2026-01-21 11:35:10.89303	5	mission	1
787	528	31	28	2026-01-21 11:35:11.191521	5	mission	1
788	562	31	28	2026-01-21 11:35:11.404361	5	mission	1
789	541	31	28	2026-01-21 11:35:11.610356	5	mission	1
790	540	31	28	2026-01-21 11:35:11.822674	5	mission	1
791	539	31	28	2026-01-21 11:35:12.020318	5	mission	1
792	538	31	28	2026-01-21 11:35:12.249245	5	mission	1
793	563	31	28	2026-01-21 11:35:12.546999	5	mission	1
794	533	31	28	2026-01-21 11:35:12.782523	5	mission	1
795	543	31	28	2026-01-21 11:35:13.054005	5	mission	1
796	532	31	28	2026-01-21 11:35:13.28978	5	mission	1
797	548	31	28	2026-01-21 11:35:13.483091	5	mission	1
798	537	31	28	2026-01-21 11:35:13.682612	5	mission	1
799	542	31	28	2026-01-21 11:35:13.884969	5	mission	1
800	544	31	28	2026-01-21 11:35:14.176341	5	mission	1
801	530	31	28	2026-01-21 11:35:14.373458	5	mission	1
802	536	31	28	2026-01-21 11:35:14.674493	5	mission	1
803	549	31	28	2026-01-21 11:35:14.897779	5	mission	1
804	545	31	28	2026-01-21 11:35:15.092147	5	mission	1
805	534	31	28	2026-01-21 11:35:15.38822	5	mission	1
806	546	31	28	2026-01-21 11:35:15.606001	5	mission	1
807	510	29	28	2026-01-21 11:36:05.377536	5	mission	1
808	521	29	28	2026-01-21 11:36:05.589715	5	mission	1
809	497	29	28	2026-01-21 11:36:05.781241	5	mission	1
810	510	29	28	2026-01-21 11:36:37.189459	5	mission	1
811	521	29	28	2026-01-21 11:36:37.427435	5	mission	1
812	497	29	28	2026-01-21 11:36:37.748762	5	mission	1
813	515	31	28	2026-01-21 11:36:48.490429	5	mission	1
814	498	31	28	2026-01-21 11:36:48.692681	5	mission	1
815	514	31	28	2026-01-21 11:36:48.891537	5	mission	1
816	502	31	28	2026-01-21 11:36:49.095263	5	mission	1
817	520	31	28	2026-01-21 11:36:49.299025	5	mission	1
818	510	31	28	2026-01-21 11:36:49.50491	5	mission	1
819	503	31	28	2026-01-21 11:36:49.732875	5	mission	1
820	523	31	28	2026-01-21 11:36:50.017424	5	mission	1
821	509	31	28	2026-01-21 11:36:50.254897	5	mission	1
822	512	31	28	2026-01-21 11:36:50.447588	5	mission	1
823	506	31	28	2026-01-21 11:36:50.640221	5	mission	1
824	495	31	28	2026-01-21 11:36:50.836022	5	mission	1
825	499	31	28	2026-01-21 11:36:51.042092	5	mission	1
826	508	31	28	2026-01-21 11:36:51.353086	5	mission	1
827	496	31	28	2026-01-21 11:36:51.554989	5	mission	1
828	505	31	28	2026-01-21 11:36:51.873623	5	mission	1
829	507	31	28	2026-01-21 11:36:52.062547	5	mission	1
830	521	31	28	2026-01-21 11:36:52.366707	5	mission	1
831	516	31	28	2026-01-21 11:36:52.580166	5	mission	1
832	501	31	28	2026-01-21 11:36:52.874978	5	mission	1
833	522	31	28	2026-01-21 11:36:53.188646	5	mission	1
834	518	31	28	2026-01-21 11:36:53.407073	5	mission	1
\.


--
-- Name: bonuscards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bonuscards_id_seq', 33, true);


--
-- Name: characters_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.characters_id_seq', 97, true);


--
-- Name: class_challenges_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_challenges_id_seq', 3, true);


--
-- Name: class_reward_options_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_reward_options_id_seq', 41, true);


--
-- Name: class_reward_rounds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_reward_rounds_id_seq', 16, true);


--
-- Name: class_reward_votes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_reward_votes_id_seq', 56, true);


--
-- Name: class_rewards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.class_rewards_id_seq', 25, true);


--
-- Name: classes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.classes_id_seq', 16, true);


--
-- Name: levels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.levels_id_seq', 45, true);


--
-- Name: missions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.missions_id_seq', 39, true);


--
-- Name: schools_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.schools_id_seq', 7, true);


--
-- Name: student_mission_uploads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.student_mission_uploads_id_seq', 4, true);


--
-- Name: student_state_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.student_state_id_seq', 1, false);


--
-- Name: student_uploads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.student_uploads_id_seq', 104, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 584, true);


--
-- Name: xp_transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.xp_transactions_id_seq', 880, true);


--
-- Name: bonuscards bonuscards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bonuscards
    ADD CONSTRAINT bonuscards_pkey PRIMARY KEY (id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: class_challenges class_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_challenges
    ADD CONSTRAINT class_challenges_pkey PRIMARY KEY (id);


--
-- Name: class_reward_options class_reward_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_options
    ADD CONSTRAINT class_reward_options_pkey PRIMARY KEY (id);


--
-- Name: class_reward_rounds class_reward_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_rounds
    ADD CONSTRAINT class_reward_rounds_pkey PRIMARY KEY (id);


--
-- Name: class_reward_votes class_reward_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_pkey PRIMARY KEY (id);


--
-- Name: class_reward_votes class_reward_votes_unique_student_round; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_unique_student_round UNIQUE (round_id, student_id);


--
-- Name: class_reward_votes class_reward_votes_unique_vote; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_unique_vote UNIQUE (round_id, student_id);


--
-- Name: class_rewards class_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_rewards
    ADD CONSTRAINT class_rewards_pkey PRIMARY KEY (id);


--
-- Name: classes classes_name_school_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_name_school_unique UNIQUE (name, school_id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: levels levels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_pkey PRIMARY KEY (id);


--
-- Name: levels levels_school_min_xp_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.levels
    ADD CONSTRAINT levels_school_min_xp_unique UNIQUE (school_id, min_xp);


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_pkey PRIMARY KEY (id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: schools schools_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_slug_key UNIQUE (slug);


--
-- Name: student_mission_uploads student_mission_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_mission_uploads
    ADD CONSTRAINT student_mission_uploads_pkey PRIMARY KEY (id);


--
-- Name: student_state student_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_state
    ADD CONSTRAINT student_state_pkey PRIMARY KEY (id);


--
-- Name: student_state student_state_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_state
    ADD CONSTRAINT student_state_user_id_key UNIQUE (user_id);


--
-- Name: student_uploads student_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_uploads
    ADD CONSTRAINT student_uploads_pkey PRIMARY KEY (id);


--
-- Name: users users_name_class_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_name_class_unique UNIQUE (name, class_id);


--
-- Name: users users_name_school_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_name_school_unique UNIQUE (name, school_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: xp_transactions xp_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_pkey PRIMARY KEY (id);


--
-- Name: class_challenges class_challenges_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_challenges
    ADD CONSTRAINT class_challenges_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_challenges class_challenges_reward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_challenges
    ADD CONSTRAINT class_challenges_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.class_rewards(id) ON DELETE CASCADE;


--
-- Name: class_reward_options class_reward_options_reward_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_options
    ADD CONSTRAINT class_reward_options_reward_fk FOREIGN KEY (reward_id) REFERENCES public.class_rewards(id) ON DELETE CASCADE;


--
-- Name: class_reward_options class_reward_options_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_options
    ADD CONSTRAINT class_reward_options_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.class_reward_rounds(id) ON DELETE CASCADE;


--
-- Name: class_reward_rounds class_reward_rounds_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_rounds
    ADD CONSTRAINT class_reward_rounds_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_reward_votes class_reward_votes_option_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.class_reward_options(id) ON DELETE CASCADE;


--
-- Name: class_reward_votes class_reward_votes_reward_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.class_rewards(id) ON DELETE CASCADE;


--
-- Name: class_reward_votes class_reward_votes_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.class_reward_rounds(id) ON DELETE CASCADE;


--
-- Name: class_reward_votes class_reward_votes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_reward_votes
    ADD CONSTRAINT class_reward_votes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: student_mission_uploads student_mission_uploads_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_mission_uploads
    ADD CONSTRAINT student_mission_uploads_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: student_mission_uploads student_mission_uploads_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_mission_uploads
    ADD CONSTRAINT student_mission_uploads_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: student_state student_state_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_state
    ADD CONSTRAINT student_state_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE SET NULL;


--
-- Name: student_state student_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_state
    ADD CONSTRAINT student_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: student_uploads student_uploads_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_uploads
    ADD CONSTRAINT student_uploads_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id);


--
-- Name: xp_transactions xp_transactions_awarded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_awarded_by_fkey FOREIGN KEY (awarded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: xp_transactions xp_transactions_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id);


--
-- Name: xp_transactions xp_transactions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict KKhsgrWkbb7xmUIlTjAP6y2EMJvUgLV0BBmjgyEBSNU02S9DiH0N3TtlacKh8UT

