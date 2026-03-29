def memcpy_auto_jump = 2:b2ba
def num_to_hex = 1:ed58

org 0xd730
home:
    setlr_pc
    setsfr
rotate_calc:
    pop xr0 (adr_of addr_rotated_x, var_c)
    calc_func
    pop xr0 (adr_of addr_rotated_y, var_d)
    calc_func
    pop xr0 (adr_of addr_upd_x, var_a)
    calc_func
    pop xr0 (adr_of addr_upd_y, var_b)
    calc_func
    pop xr0 (adr_of addr_total, 0xd3a0)
    calc_func
draw:
    pop er0 (0xd3a0)
    num_to_hex
    setlr_pc
    di,rt
    er2 = er0,er0+=er4,rt
    pop er0 (hex 60 20)
    line_draw
switch_time:
    pop er4 (adr_of [+4784] value)
    setlr_pc
    [er4]+=1,rt
    pop er2 (adr_of [+4784] value)
    er0 = [er2],r2 = 9,rt
    pop ea (adr_of table)
    ea_switchcase
    er6 = [ea+]
    sp = er6, pop er8
second:
    pop er2 (realtime_minute)
    r0 = [er2]
    r1 = 0,rt
    bcd_to_byte
    er2 = er0,er0+=er4,rt
    pop er0 (var_x)
    num_frombyte
    pop xr0 (var_y, 0x0016)
    num_frombyte
    goto loop
minute:
    pop er2 (realtime_hour)
    r0 = [er2]
    r1 = 0,rt
    bcd_to_byte
    er2 = er0,er0+=er4,rt
    pop er0 (var_x)
    num_frombyte
    pop xr0 (var_m, 0x001e)
    num_frombyte
    pop xr0 (var_y, 0x0010)
    num_frombyte
    goto loop
hour:
    pop er2 (realtime_second)
    r0 = [er2]
    r1 = 0,rt
    bcd_to_byte
    er2 = er0,er0+=er4,rt
    pop er0 (var_x)
    num_frombyte
    pop xr0 (var_m, 0x0006)
    num_frombyte
    pop xr0 (var_y, 0x0018)
    num_frombyte
    pop xr0 (adr_of [+4784] value, 0x0000)
    [er0]=r2
    render.ddd4
    setlr_pc
    buffer_clear
print_clock:
    pop xr0 (hex 42 01 40 3d)
    render_bitmap
    pop er0 (adr_of bitmap)
loop:
    setlr_pc
    di,rt
    pop xr4, xr12 (adr_of home, pr_length, adr_of [+4784] home, adr_of [-12] home)
    memcpy_auto_jump
value:
    0x0000
table:
    hex 01 00
    adr_of [-2] second
    hex 02 00
    adr_of [-2] minute
    hex 00 00
    adr_of [-2] hour
addr_rotated_x:
    adr_of rotated_x
addr_rotated_y:
    adr_of rotated_y
addr_upd_x:
    adr_of upd_x
addr_upd_y:
    adr_of upd_y
addr_total:
    adr_of total
rotated_x:
    hex 49 77 48 40 d0 00
rotated_y:
    hex c0 49 78 48 40 d0 00
upd_x:
    hex 39 36 a6 44 00
upd_y:
    hex 33 32 a6 45 00
total:
    hex 32 35 36 83 43 d0 a6 83 42 d0 00
bitmap:
    hex 00 00 00 7F E0 00 00 00 00 00 03 80 1F 00 00 00 00 00 1C 31 80 E0 00 00 00 00 60 12 40 10 00 00 00 01 80 10 40 0C 00 00 00 06 00 10 40 03 00 00 00 0B 18 10 80 00 80 00 00 11 08 11 40 30 40 00 00 21 08 3B C0 10 20 00 00 41 08 00 00 10 10 00 00 81 08 00 00 10 08 00 01 01 08 00 00 10 04 00 02 03 9C 00 00 10 02 00 04 00 00 00 00 38 01 00 04 00 00 00 00 00 19 00 08 00 00 00 00 00 24 80 0B 18 00 00 00 00 04 80 11 24 00 00 00 00 04 40 11 24 00 00 00 00 08 40 21 24 00 00 00 00 14 20 21 24 00 00 00 00 3C 20 21 24 00 00 00 00 00 20 43 98 00 00 00 00 00 10 40 00 00 00 00 00 00 10 40 00 00 00 00 00 00 10 80 00 00 00 00 00 00 10 80 00 00 00 00 00 00 08 80 00 00 00 00 00 03 88 86 00 00 00 00 00 00 48 89 00 00 00 00 00 00 88 89 00 00 07 00 00 01 88 89 00 00 07 00 00 00 48 87 00 00 07 00 00 00 48 82 00 00 00 00 00 03 88 8C 00 00 00 00 00 00 08 40 00 00 00 00 00 00 10 40 00 00 00 00 00 00 10 40 00 00 00 00 00 00 10 40 00 00 00 00 00 00 10 40 00 00 00 00 00 00 20 20 00 00 00 00 00 00 20 20 00 00 00 00 00 00 20 20 30 00 00 00 00 20 40 10 48 00 00 00 00 60 40 08 48 00 00 00 00 60 80 08 30 00 00 00 00 A0 80 04 48 00 00 00 00 F1 00 04 48 00 00 00 00 21 00 02 30 1C 00 00 C0 22 00 01 00 24 00 01 00 04 00 00 80 08 00 01 80 08 00 00 40 08 03 00 40 10 00 00 20 08 04 00 40 20 00 00 10 10 0E 00 40 40 00 00 08 10 09 03 80 80 00 00 06 00 09 00 03 00 00 00 01 80 09 00 0C 00 00 00 00 60 06 00 30 00 00 00 00 1C 00 01 C0 00 00 00 00 03 C0 1E 00 00 00 00 00 00 3F E0 00 00 00

    
inj_launcher = {
    enter_an
    adr_of home, hex fe 02
    hex c7 f0 30 30
    adr_of [+4784] home, adr_of [-12] second
    call 127ab
    memcpy_auto_jump
}